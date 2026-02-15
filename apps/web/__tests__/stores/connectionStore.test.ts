import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransportManager } = vi.hoisted(() => {
  const mockTransportManager = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    activeTransport: 'websocket' as string,
  };
  return { mockTransportManager };
});

vi.mock('@/lib/transport', () => ({
  transportManager: mockTransportManager,
  TransportManager: vi.fn(),
}));

vi.mock('@/lib/websocket', () => ({
  wsClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    state: 'disconnected',
  },
  VPWebSocketClient: vi.fn(),
}));

vi.mock('@/lib/webrtc', () => ({
  VPWebRTCClient: vi.fn(),
}));

import { useConnectionStore } from '@/stores/connectionStore';
import { useNotificationStore } from '@/stores/notificationStore';

describe('connectionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransportManager.activeTransport = 'websocket';
    useConnectionStore.setState({
      state: 'disconnected',
      webrtcState: 'disconnected',
      activeTransport: 'websocket',
      url: 'ws://localhost:9800',
    });
    useNotificationStore.setState({ notifications: [] });
  });

  it('has initial state disconnected', () => {
    const { state } = useConnectionStore.getState();
    expect(state).toBe('disconnected');
  });

  it('has default url', () => {
    const { url } = useConnectionStore.getState();
    expect(url).toBe('ws://localhost:9800');
  });

  it('connect calls transportManager.connect', () => {
    useConnectionStore.getState().connect();
    expect(mockTransportManager.connect).toHaveBeenCalledWith(
      'ws://localhost:9800',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('connect with custom url updates store', () => {
    useConnectionStore.getState().connect('ws://192.168.1.100:9800');
    expect(useConnectionStore.getState().url).toBe('ws://192.168.1.100:9800');
  });

  it('disconnect calls transportManager.disconnect', () => {
    useConnectionStore.getState().disconnect();
    expect(mockTransportManager.disconnect).toHaveBeenCalled();
    expect(useConnectionStore.getState().state).toBe('disconnected');
  });

  // New tests for webrtcState and activeTransport
  it('has initial webrtcState disconnected', () => {
    const { webrtcState } = useConnectionStore.getState();
    expect(webrtcState).toBe('disconnected');
  });

  it('has initial activeTransport websocket', () => {
    const { activeTransport } = useConnectionStore.getState();
    expect(activeTransport).toBe('websocket');
  });

  it('updates webrtcState through callback', () => {
    useConnectionStore.getState().connect();

    // Extract the webrtcState callback
    const webrtcCallback = mockTransportManager.connect.mock.calls[0][2];
    webrtcCallback('connecting');

    expect(useConnectionStore.getState().webrtcState).toBe('connecting');
  });

  it('updates activeTransport through callback', () => {
    useConnectionStore.getState().connect();

    // Extract the activeTransport callback
    const transportCallback = mockTransportManager.connect.mock.calls[0][3];
    transportCallback('webrtc');

    expect(useConnectionStore.getState().activeTransport).toBe('webrtc');
  });

  it('disconnect resets webrtcState and activeTransport', () => {
    // Set some non-default state
    useConnectionStore.setState({
      webrtcState: 'connected',
      activeTransport: 'webrtc',
    });

    useConnectionStore.getState().disconnect();

    expect(useConnectionStore.getState().webrtcState).toBe('disconnected');
    expect(useConnectionStore.getState().activeTransport).toBe('websocket');
  });

  // ── Notification integration tests ──────────────────────────────
  describe('notification integration', () => {
    it('adds success notification on connection established', () => {
      useConnectionStore.getState().connect();

      // Extract the state callback
      const stateCallback = mockTransportManager.connect.mock.calls[0][1];

      // Simulate connection established
      stateCallback('connected');

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('success');
      expect(notifications[0].message).toContain('Connected');
    });

    it('adds warning notification when connection drops', () => {
      useConnectionStore.getState().connect();

      const stateCallback = mockTransportManager.connect.mock.calls[0][1];

      // First connect, then disconnect
      stateCallback('connected');
      useNotificationStore.setState({ notifications: [] }); // Clear the success notification
      stateCallback('disconnected');

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('warning');
      expect(notifications[0].message).toContain('Disconnected');
    });

    it('does NOT add notification for disconnected -> disconnected transition', () => {
      useConnectionStore.getState().connect();

      const stateCallback = mockTransportManager.connect.mock.calls[0][1];

      // Stay disconnected
      stateCallback('disconnected');

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(0);
    });

    it('does NOT add duplicate connected notification', () => {
      useConnectionStore.getState().connect();

      const stateCallback = mockTransportManager.connect.mock.calls[0][1];

      // Connect twice
      stateCallback('connected');
      stateCallback('connected');

      const notifications = useNotificationStore.getState().notifications;
      // Should only have one success notification (second 'connected' is same state)
      expect(notifications).toHaveLength(1);
    });
  });
});
