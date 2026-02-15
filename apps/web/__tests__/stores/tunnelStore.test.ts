import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTunnelStore } from '@/stores/tunnelStore';
import { useNotificationStore } from '@/stores/notificationStore';

// Mock transport (same pattern as browserStore.test.ts)
vi.mock('@/lib/transport', () => {
  const handlers = new Map<string, Set<(msg: any) => void>>();

  const mockTransportManager = {
    send: vi.fn(),
    on: (type: string, handler: (msg: any) => void) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    _trigger: (type: string, payload: any) => {
      const typeHandlers = handlers.get(type);
      if (typeHandlers) {
        typeHandlers.forEach((handler) => handler({ type, payload }));
      }
    },
    _clear: () => {
      handlers.clear();
    },
  };

  return {
    transportManager: mockTransportManager,
  };
});

describe('tunnelStore', () => {
  let mockTransport: any;

  beforeEach(async () => {
    const transport = await import('@/lib/transport');
    mockTransport = transport.transportManager;

    useTunnelStore.setState({
      tunnels: {},
      pendingRequests: {},
    });

    useNotificationStore.setState({ notifications: [] });
    vi.clearAllMocks();
  });

  it('initial state has no tunnels', () => {
    const state = useTunnelStore.getState();
    expect(state.tunnels).toEqual({});
    expect(state.pendingRequests).toEqual({});
  });

  it('openTunnel sends tunnel:open and sets state to opening', () => {
    useTunnelStore.getState().openTunnel('t1', 3000);

    expect(mockTransport.send).toHaveBeenCalledWith('tunnel:open', {
      tunnelId: 't1',
      targetPort: 3000,
    });
    expect(useTunnelStore.getState().tunnels['t1']).toEqual({
      tunnelId: 't1',
      targetPort: 3000,
      state: 'opening',
    });
  });

  it('openTunnel with targetHost sends tunnel:open with host', () => {
    useTunnelStore.getState().openTunnel('t1', 8080, '192.168.1.1');

    expect(mockTransport.send).toHaveBeenCalledWith('tunnel:open', {
      tunnelId: 't1',
      targetPort: 8080,
      targetHost: '192.168.1.1',
    });
  });

  it('handles tunnel:opened message', () => {
    useTunnelStore.getState().openTunnel('t1', 3000);

    mockTransport._trigger('tunnel:opened', {
      tunnelId: 't1',
      targetPort: 3000,
    });

    expect(useTunnelStore.getState().tunnels['t1'].state).toBe('open');
  });

  it('handles tunnel:error message', () => {
    useTunnelStore.getState().openTunnel('t1', 3000);

    mockTransport._trigger('tunnel:error', {
      tunnelId: 't1',
      error: 'Connection refused',
    });

    expect(useTunnelStore.getState().tunnels['t1'].state).toBe('error');
    expect(useTunnelStore.getState().tunnels['t1'].error).toBe('Connection refused');
  });

  it('tunnel:error adds error notification', () => {
    useTunnelStore.getState().openTunnel('t1', 3000);

    mockTransport._trigger('tunnel:error', {
      tunnelId: 't1',
      error: 'Connection refused',
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('error');
    expect(notifications[0].message).toContain('Tunnel error');
  });

  it('closeTunnel sends tunnel:close and removes tunnel', () => {
    useTunnelStore.getState().openTunnel('t1', 3000);
    mockTransport._trigger('tunnel:opened', { tunnelId: 't1', targetPort: 3000 });

    useTunnelStore.getState().closeTunnel('t1');

    expect(mockTransport.send).toHaveBeenCalledWith('tunnel:close', { tunnelId: 't1' });
    expect(useTunnelStore.getState().tunnels['t1']).toBeUndefined();
  });

  it('fetch sends tunnel:request and returns response', async () => {
    useTunnelStore.getState().openTunnel('t1', 3000);
    mockTransport._trigger('tunnel:opened', { tunnelId: 't1', targetPort: 3000 });

    const fetchPromise = useTunnelStore.getState().fetch('t1', '/api/data', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    // Verify tunnel:request was sent
    expect(mockTransport.send).toHaveBeenCalledWith(
      'tunnel:request',
      expect.objectContaining({
        tunnelId: 't1',
        method: 'GET',
        path: '/api/data',
        headers: { Accept: 'application/json' },
      })
    );

    // Get the requestId from the sent message
    const sentPayload = mockTransport.send.mock.calls.find(
      (c: any[]) => c[0] === 'tunnel:request'
    )[1];

    // Simulate tunnel:response
    mockTransport._trigger('tunnel:response', {
      tunnelId: 't1',
      requestId: sentPayload.requestId,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: btoa('{"ok":true}'),
    });

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/json');
    expect(response.body).toBe(btoa('{"ok":true}'));
  });

  it('fetch rejects if tunnel is not open', async () => {
    await expect(useTunnelStore.getState().fetch('nonexistent', '/api/data')).rejects.toThrow(
      'Tunnel "nonexistent" is not open'
    );
  });

  it('fetch with POST body sends base64-encoded body', async () => {
    useTunnelStore.getState().openTunnel('t1', 3000);
    mockTransport._trigger('tunnel:opened', { tunnelId: 't1', targetPort: 3000 });

    const body = btoa('{"name":"test"}');
    const fetchPromise = useTunnelStore.getState().fetch('t1', '/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const sentPayload = mockTransport.send.mock.calls.find(
      (c: any[]) => c[0] === 'tunnel:request'
    )[1];

    expect(sentPayload.body).toBe(body);

    mockTransport._trigger('tunnel:response', {
      tunnelId: 't1',
      requestId: sentPayload.requestId,
      status: 201,
      headers: {},
    });

    const response = await fetchPromise;
    expect(response.status).toBe(201);
  });

  it('tunnel:error with requestId rejects pending fetch', async () => {
    useTunnelStore.getState().openTunnel('t1', 3000);
    mockTransport._trigger('tunnel:opened', { tunnelId: 't1', targetPort: 3000 });

    const fetchPromise = useTunnelStore.getState().fetch('t1', '/api/fail');

    const sentPayload = mockTransport.send.mock.calls.find(
      (c: any[]) => c[0] === 'tunnel:request'
    )[1];

    mockTransport._trigger('tunnel:error', {
      tunnelId: 't1',
      requestId: sentPayload.requestId,
      error: 'Target unreachable',
      code: 'PROXY_ERROR',
    });

    await expect(fetchPromise).rejects.toThrow('Target unreachable');
  });

  it('closeTunnel rejects all pending requests', async () => {
    useTunnelStore.getState().openTunnel('t1', 3000);
    mockTransport._trigger('tunnel:opened', { tunnelId: 't1', targetPort: 3000 });

    const promise1 = useTunnelStore.getState().fetch('t1', '/a');
    const promise2 = useTunnelStore.getState().fetch('t1', '/b');

    useTunnelStore.getState().closeTunnel('t1');

    await expect(promise1).rejects.toThrow('Tunnel closed');
    await expect(promise2).rejects.toThrow('Tunnel closed');
  });

  it('openTunnelForPort creates tunnel with port-based ID', () => {
    useTunnelStore.getState().openTunnelForPort(3000);

    expect(mockTransport.send).toHaveBeenCalledWith('tunnel:open', {
      tunnelId: 'port-3000',
      targetPort: 3000,
    });
    expect(useTunnelStore.getState().tunnels['port-3000']).toBeDefined();
  });

  it('getTunnelForPort returns tunnel by port', () => {
    useTunnelStore.getState().openTunnelForPort(3000);
    mockTransport._trigger('tunnel:opened', { tunnelId: 'port-3000', targetPort: 3000 });

    const tunnel = useTunnelStore.getState().getTunnelForPort(3000);
    expect(tunnel).toBeDefined();
    expect(tunnel?.state).toBe('open');
  });
});
