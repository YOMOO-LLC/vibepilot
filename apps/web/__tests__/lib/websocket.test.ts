import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VPWebSocketClient } from '../../src/lib/websocket';
import { MessageType } from '@vibepilot/protocol';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Auto-connect
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('VPWebSocketClient', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('connects and reports state changes', async () => {
    const client = new VPWebSocketClient();
    const states: string[] = [];

    client.connect('ws://localhost:9800', (state) => {
      states.push(state);
    });

    expect(states).toContain('connecting');

    // Wait for "open" event
    await new Promise((r) => setTimeout(r, 10));
    expect(states).toContain('connected');
    expect(client.state).toBe('connected');
  });

  it('handles disconnect', async () => {
    const client = new VPWebSocketClient();
    const states: string[] = [];

    client.connect('ws://localhost:9800', (state) => {
      states.push(state);
    });
    await new Promise((r) => setTimeout(r, 10));

    client.disconnect();
    expect(states).toContain('disconnected');
    expect(client.state).toBe('disconnected');
  });

  it('sends messages as serialized JSON', async () => {
    const client = new VPWebSocketClient();
    client.connect('ws://localhost:9800');
    await new Promise((r) => setTimeout(r, 10));

    client.send(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });

    const mock = MockWebSocket.instances[0];
    expect(mock.sent).toHaveLength(1);

    const sent = JSON.parse(mock.sent[0]);
    expect(sent.type).toBe('terminal:create');
    expect(sent.payload.sessionId).toBe('sess-1');
    expect(sent.id).toBeTruthy();
    expect(sent.timestamp).toBeGreaterThan(0);
  });

  it('throws when sending while disconnected', () => {
    const client = new VPWebSocketClient();
    expect(() => client.send(MessageType.TERMINAL_INPUT, { sessionId: 's', data: 'd' })).toThrow(
      'WebSocket not connected'
    );
  });

  it('receives and routes messages by type', async () => {
    const client = new VPWebSocketClient();
    client.connect('ws://localhost:9800');
    await new Promise((r) => setTimeout(r, 10));

    const handler = vi.fn();
    client.on(MessageType.TERMINAL_OUTPUT, handler);

    // Simulate incoming message
    const mock = MockWebSocket.instances[0];
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'terminal:output',
        id: 'msg-1',
        timestamp: Date.now(),
        payload: { sessionId: 'sess-1', data: 'hello' },
      }),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'terminal:output',
        payload: { sessionId: 'sess-1', data: 'hello' },
      })
    );
  });

  it('supports global message handler', async () => {
    const client = new VPWebSocketClient();
    client.connect('ws://localhost:9800');
    await new Promise((r) => setTimeout(r, 10));

    const handler = vi.fn();
    client.onAny(handler);

    const mock = MockWebSocket.instances[0];
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'terminal:created',
        id: 'msg-1',
        timestamp: Date.now(),
        payload: { sessionId: 'sess-1', pid: 1234 },
      }),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe removes handler', async () => {
    const client = new VPWebSocketClient();
    client.connect('ws://localhost:9800');
    await new Promise((r) => setTimeout(r, 10));

    const handler = vi.fn();
    const unsub = client.on(MessageType.TERMINAL_OUTPUT, handler);
    unsub();

    const mock = MockWebSocket.instances[0];
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'terminal:output',
        id: 'msg-1',
        timestamp: Date.now(),
        payload: { sessionId: 'sess-1', data: 'test' },
      }),
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
