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
    subscribe: vi.fn().mockResolvedValue({ status: 'subscribed' }),
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

      mockPresenceChannel.trigger('connection-request', { agentId: 'other-agent' });

      // Should not create signaling channel
      expect(mockSupabase.channel).toHaveBeenCalledTimes(1); // Only presence channel
    });

    it('should create signaling channel and reply READY', async () => {
      await signaling.start(mockPresenceChannel);

      mockPresenceChannel.trigger('connection-request', { agentId: 'agent-456' });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should create signaling channel
      expect(mockSupabase.channel).toHaveBeenCalledWith('agent:agent-456:signaling');

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
        mockPresenceChannel.trigger('connection-request', { agentId: 'agent-456' });

        await vi.runAllTimersAsync();

        const signalingChannel = mockSupabase.channel('agent:agent-456:signaling');

        // 2 minutes later should cleanup
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
      mockPresenceChannel.trigger('connection-request', { agentId: 'agent-456' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const signalingChannel = mockSupabase.channel('agent:agent-456:signaling');

      // Trigger offer
      signalingChannel.trigger('offer', { sdp: 'offer-sdp' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPeer.handleOffer).toHaveBeenCalledWith('offer-sdp');
      expect(signalingChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'answer',
        payload: { sdp: 'answer-sdp' },
      });
    });
  });
});
