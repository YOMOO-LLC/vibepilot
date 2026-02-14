import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client module before importing stores
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockResolvedValue(undefined),
  presenceState: vi.fn(() => ({})),
};

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      order: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: 'agent-1',
              name: 'test-project',
              platform: 'darwin',
              last_seen: new Date().toISOString(),
            },
          ],
        })
      ),
    })),
  })),
  channel: vi.fn(() => mockChannel),
  auth: {
    getSession: vi.fn(() =>
      Promise.resolve({
        data: {
          session: {
            access_token: 'test-token',
            user: { id: 'test-user-id', email: 'test@example.com' },
          },
        },
      })
    ),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
};

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}));

// Now import after mocks are set up
const { agentStore } = await import('../../src/stores/agentStore');

describe('agentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    agentStore.setState({
      agents: [],
      presenceChannel: null,
      supabase: null,
    });
  });

  it('should initialize and load agents from database', async () => {
    await agentStore.getState().initialize();

    const agents = agentStore.getState().agents;

    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('test-project');
    expect(agents[0].online).toBe(false);
  });

  it('should subscribe to presence channel', async () => {
    await agentStore.getState().initialize();

    expect(mockSupabase.channel).toHaveBeenCalledWith(
      expect.stringContaining('agents'),
      expect.any(Object)
    );
    expect(mockChannel.on).toHaveBeenCalledWith(
      'presence',
      { event: 'sync' },
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });
});
