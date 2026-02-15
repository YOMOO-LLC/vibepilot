import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VPWebSocketClient } from '../../src/lib/websocket';
import { MessageType } from '@vibepilot/protocol';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static autoConnect = true;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Auto-connect (can be disabled for reconnect failure tests)
    if (MockWebSocket.autoConnect) {
      setTimeout(() => this.onopen?.(), 0);
    }
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

/** Helper: advance fake timers to fire the auto-connect setTimeout(0) */
async function flushConnect() {
  await vi.advanceTimersByTimeAsync(1);
}

describe('VPWebSocketClient', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    MockWebSocket.autoConnect = true;
  });

  afterEach(() => {
    vi.useRealTimers();
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
    await flushConnect();
    expect(states).toContain('connected');
    expect(client.state).toBe('connected');
  });

  it('handles disconnect', async () => {
    const client = new VPWebSocketClient();
    const states: string[] = [];

    client.connect('ws://localhost:9800', (state) => {
      states.push(state);
    });
    await flushConnect();

    client.disconnect();
    expect(states).toContain('disconnected');
    expect(client.state).toBe('disconnected');
  });

  it('sends messages as serialized JSON', async () => {
    const client = new VPWebSocketClient();
    client.connect('ws://localhost:9800');
    await flushConnect();

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
    await flushConnect();

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
    await flushConnect();

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
    await flushConnect();

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

  // ── Reconnection tests ─────────────────────────────────────────
  describe('auto-reconnect with exponential backoff', () => {
    it('schedules reconnect after connection drops', async () => {
      const client = new VPWebSocketClient();
      const states: string[] = [];

      client.connect('ws://localhost:9800', (state) => {
        states.push(state);
      });
      await flushConnect();
      expect(client.state).toBe('connected');

      // Simulate server-side close
      const ws = MockWebSocket.instances[0];
      ws.close();

      expect(client.state).toBe('disconnected');

      // Advance past first reconnect delay (3000ms base)
      await vi.advanceTimersByTimeAsync(3001);

      // A new WebSocket instance should have been created
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(states).toContain('connecting');
    });

    it('uses exponential backoff delays', async () => {
      const client = new VPWebSocketClient();

      client.connect('ws://localhost:9800');
      await flushConnect(); // First connect succeeds

      // Disable auto-connect to simulate unreachable server during reconnects
      MockWebSocket.autoConnect = false;

      // Simulate close -> triggers reconnect
      MockWebSocket.instances[0].close();

      // Attempt 0: delay = 3000ms (3000 * 2^0)
      await vi.advanceTimersByTimeAsync(2999);
      expect(MockWebSocket.instances).toHaveLength(1); // Not yet
      await vi.advanceTimersByTimeAsync(2);
      expect(MockWebSocket.instances).toHaveLength(2); // First reconnect

      // Close the new instance (simulating failed connection)
      MockWebSocket.instances[1].close();

      // Attempt 1: delay = 6000ms (3000 * 2^1)
      await vi.advanceTimersByTimeAsync(5999);
      expect(MockWebSocket.instances).toHaveLength(2); // Not yet
      await vi.advanceTimersByTimeAsync(2);
      expect(MockWebSocket.instances).toHaveLength(3); // Second reconnect

      // Close again
      MockWebSocket.instances[2].close();

      // Attempt 2: delay = 12000ms (3000 * 2^2)
      await vi.advanceTimersByTimeAsync(11999);
      expect(MockWebSocket.instances).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(2);
      expect(MockWebSocket.instances).toHaveLength(4); // Third reconnect

      client.disconnect();
    });

    it('resets reconnect counter on successful connection', async () => {
      const client = new VPWebSocketClient();

      client.connect('ws://localhost:9800');
      await flushConnect(); // connected

      // Drop and reconnect
      MockWebSocket.instances[0].close();
      await vi.advanceTimersByTimeAsync(3001); // first reconnect (3s)
      await flushConnect(); // second instance connects

      expect(client.state).toBe('connected');

      // Drop again -> should use base delay (3s), not doubled
      MockWebSocket.instances[1].close();
      await vi.advanceTimersByTimeAsync(3001);
      expect(MockWebSocket.instances).toHaveLength(3); // reconnected with base delay

      client.disconnect();
    });

    it('stops reconnecting after max attempts (10)', async () => {
      const client = new VPWebSocketClient();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      client.connect('ws://localhost:9800');
      await flushConnect();

      // Disable auto-connect to simulate persistent failure
      MockWebSocket.autoConnect = false;

      // Simulate 10 consecutive failures
      for (let i = 0; i < 10; i++) {
        MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
        const delay = Math.min(3000 * Math.pow(2, i), 30000);
        await vi.advanceTimersByTimeAsync(delay + 1);
      }

      // The last created instance: close it to trigger the 11th attempt
      MockWebSocket.instances[MockWebSocket.instances.length - 1].close();

      const instanceCountAfterMax = MockWebSocket.instances.length;

      // Should NOT create any more instances (max 10 reached)
      await vi.advanceTimersByTimeAsync(60000);
      expect(MockWebSocket.instances.length).toBe(instanceCountAfterMax);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max reconnect attempts'));

      client.disconnect();
      consoleSpy.mockRestore();
    });

    it('does NOT reconnect after explicit disconnect()', async () => {
      const client = new VPWebSocketClient();

      client.connect('ws://localhost:9800');
      await flushConnect();

      client.disconnect();

      // Wait well past any reconnect delay
      await vi.advanceTimersByTimeAsync(60000);

      // Should still be only 1 instance (the original)
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(client.state).toBe('disconnected');
    });

    it('backoff delay is capped at 30 seconds', async () => {
      const client = new VPWebSocketClient();

      client.connect('ws://localhost:9800');
      await flushConnect();

      // Disable auto-connect for consistent failure simulation
      MockWebSocket.autoConnect = false;

      // Burn through attempts 0-3
      // attempt 0: 3s, 1: 6s, 2: 12s, 3: 24s
      for (let i = 0; i < 4; i++) {
        MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
        const delay = Math.min(3000 * Math.pow(2, i), 30000);
        await vi.advanceTimersByTimeAsync(delay + 1);
      }

      // Now at attempt 4: close and check cap
      // 3000 * 2^4 = 48000 -> capped to 30000
      MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
      const countBefore = MockWebSocket.instances.length;

      // At 29999ms, should NOT have reconnected
      await vi.advanceTimersByTimeAsync(29999);
      expect(MockWebSocket.instances.length).toBe(countBefore);

      // At 30001ms total, should reconnect (capped at 30s)
      await vi.advanceTimersByTimeAsync(2);
      expect(MockWebSocket.instances.length).toBe(countBefore + 1);

      client.disconnect();
    });
  });
});
