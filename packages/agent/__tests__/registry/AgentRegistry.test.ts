import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry } from '../../src/registry/AgentRegistryUtil';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('AgentRegistry', () => {
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'test-agent-id' },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      }),
    } as any;
  });

  it('should register agent and return ID', async () => {
    const metadata = {
      name: 'test-project',
      platform: 'darwin' as const,
      version: '0.1.0',
      projectPath: '/Users/test/project',
      tags: ['web'],
    };

    const agentId = await AgentRegistry.register(mockSupabase, metadata);

    expect(agentId).toBe('test-agent-id');
    expect(mockSupabase.from).toHaveBeenCalledWith('agents');
  });

  it('should update last_seen timestamp', async () => {
    await AgentRegistry.updateLastSeen(mockSupabase, 'test-agent-id');

    expect(mockSupabase.from).toHaveBeenCalledWith('agents');
  });

  it('should throw error if registration fails', async () => {
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' },
            }),
          }),
        }),
      }),
    } as any;

    const metadata = {
      name: 'test-project',
      platform: 'darwin' as const,
      version: '0.1.0',
      projectPath: '/Users/test/project',
    };

    await expect(AgentRegistry.register(mockSupabase, metadata)).rejects.toThrow(
      'Agent registration failed'
    );
  });
});
