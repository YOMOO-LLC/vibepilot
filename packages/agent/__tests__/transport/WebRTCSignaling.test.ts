import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// Mock WebRTCPeer BEFORE importing WebRTCSignaling
vi.mock('../../src/transport/WebRTCPeer', () => ({
  WebRTCPeer: vi.fn(),
}));

import { WebRTCSignaling } from '../../src/transport/WebRTCSignaling';
import { WebRTCPeer } from '../../src/transport/WebRTCPeer';

// Mock 辅助函数
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

describe('WebRTCSignaling (Agent)', () => {
  let mockSupabase: any;
  let mockPresenceChannel: any;
  let signaling: WebRTCSignaling;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    mockPresenceChannel = mockSupabase.channel('user:user-123:agents');
    signaling = new WebRTCSignaling(mockSupabase, 'user-123', 'agent-456');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('start()', () => {
    it('should listen on presence channel for connection requests', async () => {
      await signaling.start(mockPresenceChannel);

      expect(mockPresenceChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'connection-request' },
        expect.any(Function)
      );
    });
  });

  describe('handleConnectionRequest()', () => {
    it('should ignore requests for other agents', async () => {
      await signaling.start(mockPresenceChannel);

      mockPresenceChannel.trigger('connection-request', { payload: { agentId: 'other-agent' } });

      // Should not create signaling channel
      expect(mockSupabase.channel).toHaveBeenCalledTimes(1); // Only presence channel
    });

    it('should create signaling channel and reply READY', async () => {
      await signaling.start(mockPresenceChannel);

      mockPresenceChannel.trigger('connection-request', { payload: { agentId: 'agent-456' } });

      // Wait for async processing (subscription callback + promise resolution)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should create signaling channel
      expect(mockSupabase.channel).toHaveBeenCalledWith('agent:agent-456:signaling', {
        config: { broadcast: { self: false } },
      });

      // Should reply READY
      expect(mockPresenceChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'connection-ready',
        payload: { agentId: 'agent-456' },
      });
    });

    it('should schedule cleanup after 2 minutes', async () => {
      vi.useFakeTimers();

      try {
        await signaling.start(mockPresenceChannel);
        mockPresenceChannel.trigger('connection-request', { payload: { agentId: 'agent-456' } });

        // Run immediate timers to complete subscription callback
        await vi.runAllTimersAsync();

        const signalingChannel = mockSupabase.channel('agent:agent-456:signaling');

        // Advance 2 minutes to trigger cleanup
        await vi.advanceTimersByTimeAsync(120_000);

        expect(signalingChannel.unsubscribe).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('handleOffer()', () => {
    it('should generate answer and send via signaling channel', async () => {
      // Mock WebRTCPeer instance
      const mockPeer = {
        handleOffer: vi.fn().mockResolvedValue('answer-sdp'),
        on: vi.fn(),
        addIceCandidate: vi.fn(),
        close: vi.fn(),
      };

      // Setup WebRTCPeer mock to return our mock instance
      vi.mocked(WebRTCPeer).mockImplementation(() => mockPeer as any);

      await signaling.start(mockPresenceChannel);
      mockPresenceChannel.trigger('connection-request', { payload: { agentId: 'agent-456' } });

      // Wait for connection-request handling to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const signalingChannel = mockSupabase.channel('agent:agent-456:signaling');

      // Trigger offer with correct payload structure
      signalingChannel.trigger('offer', { payload: { sdp: 'offer-sdp' } });

      // Wait for offer handling to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPeer.handleOffer).toHaveBeenCalledWith('offer-sdp');
      expect(signalingChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'answer',
        payload: { sdp: 'answer-sdp' },
      });
    });
  });
});
