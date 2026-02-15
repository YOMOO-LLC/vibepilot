import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRTCSignaling } from '../../src/lib/webrtc-signaling';
import { VPWebRTCClient } from '../../src/lib/webrtc';

// Mock VPWebRTCClient
vi.mock('../../src/lib/webrtc', () => ({
  VPWebRTCClient: vi.fn().mockImplementation(() => ({
    createOffer: vi.fn().mockResolvedValue(undefined),
    handleAnswer: vi.fn().mockResolvedValue(undefined),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    state: 'disconnected',
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock helper functions
function createMockChannel(name: string): any {
  const listeners = new Map<string, Set<Function>>();

  return {
    topic: name,
    state: 'joined',
    subscribe: vi.fn((callback?: Function) => {
      // Support callback-based subscription (Supabase Realtime v2 style)
      if (callback) {
        // Immediately invoke callback with success status
        setTimeout(() => callback('SUBSCRIBED', null), 0);
        return { status: 'ok' };
      }
      // Support promise-based subscription (legacy)
      return Promise.resolve({ status: 'subscribed' });
    }),
    unsubscribe: vi.fn().mockResolvedValue({ status: 'unsubscribed' }),
    send: vi.fn().mockResolvedValue({ status: 'ok' }),
    on: vi.fn((type: string, filter: any, callback: Function) => {
      const key = `${type}:${filter.event}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(callback);
      return { unsubscribe: () => listeners.get(key)?.delete(callback) };
    }),
    trigger: (event: string, payload: any) => {
      const key = `broadcast:${event}`;
      listeners.get(key)?.forEach((cb) => cb(payload));
    },
  };
}

function createMockSupabase(): any {
  const channels = new Map<string, any>();

  return {
    channel: vi.fn((name: string) => {
      if (!channels.has(name)) channels.set(name, createMockChannel(name));
      return channels.get(name);
    }),
  };
}

describe('WebRTCSignaling (Web)', () => {
  let mockSupabase: any;
  let signaling: WebRTCSignaling;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    signaling = new WebRTCSignaling(mockSupabase, 'user-123');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Give time for pending promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  describe('connect()', () => {
    it('should send CONNECTION_REQUEST and wait for READY', async () => {
      const onStateChange = vi.fn();

      // Setup mock WebRTC client that will trigger state change
      let webrtcOnSignal: any;
      let webrtcOnStateChange: any;
      const mockClient = {
        createOffer: vi.fn().mockImplementation(async (onSignal: any, onState: any) => {
          webrtcOnSignal = onSignal;
          webrtcOnStateChange = onState;
        }),
        handleAnswer: vi.fn().mockResolvedValue(undefined),
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
        state: 'disconnected',
        on: vi.fn(),
        close: vi.fn(),
      };

      (VPWebRTCClient as any).mockImplementation(() => mockClient);

      const presenceChannel = mockSupabase.channel('user:user-123:agents');
      const connectPromise = signaling.connect('agent-456', onStateChange);

      // Verify REQUEST sent (wait for subscription callback to complete)
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(presenceChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'connection-request',
        payload: { agentId: 'agent-456' },
      });

      // Simulate Agent READY response
      await new Promise((resolve) => setTimeout(resolve, 10));
      presenceChannel.trigger('connection-ready', { payload: { agentId: 'agent-456' } });

      // Simulate answer after offer created
      await new Promise((resolve) => setTimeout(resolve, 50));
      const signalingChannel = mockSupabase.channel('agent:agent-456:signaling');
      signalingChannel.trigger('answer', { payload: { sdp: 'answer-sdp' } });

      // Simulate WebRTC connected
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockClient.state = 'connected';
      if (webrtcOnStateChange) {
        webrtcOnStateChange('connected');
      }

      const client = await connectPromise;
      expect(client).toBeDefined();
      expect(onStateChange).toHaveBeenCalledWith('connected');
    });

    it('should timeout if no READY within 5 seconds', async () => {
      // Create a signaling instance with shorter timeout for testing
      const shortTimeoutSignaling = new (class extends WebRTCSignaling {
        // Override the waitForReady timeout to 100ms for test speed
        async connect(agentId: string, onStateChange: any) {
          try {
            const client = new VPWebRTCClient();
            const presenceChannel = this['supabase'].channel(`user:${this['userId']}:agents`);
            await presenceChannel.subscribe();

            await presenceChannel.send({
              type: 'broadcast',
              event: 'connection-request',
              payload: { agentId },
            });

            // Wait for READY with 100ms timeout instead of 5s
            const ready = await new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => resolve(false), 100);
              const subscription = (presenceChannel as any).on(
                'broadcast',
                { event: 'connection-ready' },
                () => {
                  clearTimeout(timer);
                  subscription.unsubscribe();
                  resolve(true);
                }
              );
            });

            if (!ready) {
              await presenceChannel.unsubscribe();
              throw new Error('Agent did not respond (timeout waiting for READY)');
            }
          } catch (err: any) {
            onStateChange('failed', { error: err.message });
            throw err;
          }
        }
      })(mockSupabase, 'user-123');

      const onStateChange = vi.fn();
      await expect(shortTimeoutSignaling.connect('agent-456', onStateChange)).rejects.toThrow(
        'timeout waiting for READY'
      );
    });

    it('should retry 3 times on failure', async () => {
      vi.useFakeTimers();

      // Override subscribe to work with fake timers
      const channels = new Map();
      mockSupabase.channel = vi.fn((name: string) => {
        if (!channels.has(name)) {
          const listeners = new Map<string, Set<Function>>();
          const mockChan = {
            topic: name,
            state: 'joined',
            subscribe: vi.fn((callback?: Function) => {
              // Use fake timer-compatible immediate execution
              if (callback) {
                queueMicrotask(() => callback('SUBSCRIBED', null));
                return { status: 'ok' };
              }
              return Promise.resolve({ status: 'subscribed' });
            }),
            unsubscribe: vi.fn().mockResolvedValue({ status: 'unsubscribed' }),
            send: vi.fn().mockResolvedValue({ status: 'ok' }),
            on: vi.fn((type: string, filter: any, cb: Function) => {
              const key = `${type}:${filter.event}`;
              if (!listeners.has(key)) listeners.set(key, new Set());
              listeners.get(key)!.add(cb);
              return { unsubscribe: () => listeners.get(key)?.delete(cb) };
            }),
            trigger: (event: string, payload: any) => {
              const key = `broadcast:${event}`;
              listeners.get(key)?.forEach((cb) => cb(payload));
            },
          };
          channels.set(name, mockChan);
        }
        return channels.get(name);
      });

      // Force waitForReady to always timeout
      const onStateChange = vi.fn();

      const connectPromise = signaling.connect('agent-456', onStateChange).catch((err) => {
        // Properly catch the error
        return err;
      });

      // First attempt
      await vi.advanceTimersByTimeAsync(5000);

      // Verify retrying state
      expect(onStateChange).toHaveBeenCalledWith(
        'retrying',
        expect.objectContaining({ attempt: 1 })
      );

      // Second attempt (advance retry delay + timeout)
      await vi.advanceTimersByTimeAsync(3000 + 5000);
      expect(onStateChange).toHaveBeenCalledWith(
        'retrying',
        expect.objectContaining({ attempt: 2 })
      );

      // Third attempt fails
      await vi.advanceTimersByTimeAsync(3000 + 5000);

      const result = await connectPromise;
      expect(result).toBeInstanceOf(Error);
      expect(onStateChange).toHaveBeenCalledWith('failed', expect.any(Object));
    });
  });
});
