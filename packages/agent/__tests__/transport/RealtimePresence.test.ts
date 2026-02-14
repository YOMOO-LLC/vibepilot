import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimePresence } from '../../src/transport/RealtimePresence';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

describe('RealtimePresence', () => {
  let mockChannel: RealtimeChannel;
  let mockSupabase: SupabaseClient;
  let presence: RealtimePresence;

  beforeEach(() => {
    vi.useFakeTimers();

    mockChannel = {
      subscribe: vi.fn().mockResolvedValue(undefined),
      track: vi.fn().mockResolvedValue(undefined),
      untrack: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockSupabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
    } as any;

    presence = new RealtimePresence(mockSupabase, 'test-user-id');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should announce online status', async () => {
    const agentMetadata = {
      agentId: 'test-agent-id',
      name: 'test-project',
      platform: 'darwin' as const,
      publicKey: 'test-public-key',
      onlineAt: new Date().toISOString(),
    };

    await presence.announceOnline('test-agent-id', agentMetadata);

    expect(mockSupabase.channel).toHaveBeenCalledWith(
      'user:test-user-id:agents',
      expect.any(Object)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
    expect(mockChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'test-agent-id',
        name: 'test-project',
      })
    );
  });

  it('should send heartbeat every 30 seconds', async () => {
    const agentMetadata = {
      agentId: 'test-agent-id',
      name: 'test-project',
      platform: 'darwin' as const,
      publicKey: 'test-public-key',
      onlineAt: new Date().toISOString(),
    };

    await presence.announceOnline('test-agent-id', agentMetadata);

    // Fast-forward 30 seconds
    vi.advanceTimersByTime(30000);

    // Heartbeat should be sent
    expect(mockChannel.track).toHaveBeenCalledTimes(2);
  });

  it('should announce offline status', async () => {
    const agentMetadata = {
      agentId: 'test-agent-id',
      name: 'test-project',
      platform: 'darwin' as const,
      publicKey: 'test-public-key',
      onlineAt: new Date().toISOString(),
    };

    await presence.announceOnline('test-agent-id', agentMetadata);
    await presence.announceOffline();

    expect(mockChannel.untrack).toHaveBeenCalled();
    expect(mockChannel.unsubscribe).toHaveBeenCalled();
  });
});
