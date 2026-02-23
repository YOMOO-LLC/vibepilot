import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Tests for useAgentStore.selectAgent() → connectionStore bridge in Supabase mode
// These use vi.resetModules() + dynamic imports to reload the module with AUTH_MODE='supabase'

describe('useAgentStore.selectAgent in Supabase mode', () => {
  beforeEach(async () => {
    // Set env before module load so AUTH_MODE constant picks it up
    process.env.NEXT_PUBLIC_AUTH_MODE = 'supabase';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    // Reset all modules so the new AUTH_MODE value is picked up
    vi.resetModules();

    // Re-register mocks after resetModules (doMock is not hoisted)
    vi.doMock('@/lib/transport', () => ({
      transportManager: {
        useWebRTCClient: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
      },
    }));

    vi.doMock('@/lib/webrtc-signaling', () => ({
      WebRTCSignaling: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue({ close: vi.fn(), state: 'connected' }),
      })),
    }));

    vi.doMock('@/lib/supabase', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: 'test-token',
                user: { id: 'test-user-id' },
              },
            },
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'agent-1',
                    name: 'Test Agent',
                    public_url: 'ws://localhost:9800',
                    status: 'online',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      },
    }));

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn().mockReturnValue({}),
    }));

    vi.doMock('@/stores/notificationStore', () => ({
      useNotificationStore: {
        getState: vi.fn().mockReturnValue({ add: vi.fn() }),
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('updates connectionStore to connected eagerly after signaling.connect() resolves', async () => {
    const { useAgentStore } = await import('@/stores/agentStore');
    const { transportManager } = await import('@/lib/transport');
    const { useConnectionStore } = await import('@/stores/connectionStore');

    // Reset connection store state
    useConnectionStore.setState({
      state: 'disconnected',
      webrtcState: 'disconnected',
      activeTransport: 'websocket',
    });

    // Seed agents in store
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Test Agent', url: 'ws://localhost:9800' }],
    });

    // Select the agent (triggers WebRTC signaling)
    await useAgentStore.getState().selectAgent('agent-1');

    // Verify useWebRTCClient was called
    expect(transportManager.useWebRTCClient).toHaveBeenCalled();

    // connectionStore should be updated eagerly (immediately after signaling.connect() resolves)
    expect(useConnectionStore.getState().state).toBe('connected');
    expect(useConnectionStore.getState().webrtcState).toBe('connected');
    expect(useConnectionStore.getState().activeTransport).toBe('webrtc');
  });

  it('updates connectionStore to disconnected when WebRTC disconnects', async () => {
    const { useAgentStore } = await import('@/stores/agentStore');
    const { transportManager } = await import('@/lib/transport');
    const { useConnectionStore } = await import('@/stores/connectionStore');

    // Reset connection store state
    useConnectionStore.setState({
      state: 'disconnected',
      webrtcState: 'disconnected',
      activeTransport: 'websocket',
    });

    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Test Agent', url: 'ws://localhost:9800' }],
    });

    await useAgentStore.getState().selectAgent('agent-1');

    const [, onRtcStateChange] = (transportManager.useWebRTCClient as any).mock.calls[0];

    // Connect then disconnect
    onRtcStateChange('connected');
    expect(useConnectionStore.getState().state).toBe('connected');

    onRtcStateChange('disconnected');
    expect(useConnectionStore.getState().state).toBe('disconnected');
    expect(useConnectionStore.getState().webrtcState).toBe('disconnected');
    expect(useConnectionStore.getState().activeTransport).toBe('websocket');
  });

  it('updates connectionStore to disconnected with failed webrtcState when WebRTC fails', async () => {
    const { useAgentStore } = await import('@/stores/agentStore');
    const { transportManager } = await import('@/lib/transport');
    const { useConnectionStore } = await import('@/stores/connectionStore');

    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Test Agent', url: 'ws://localhost:9800' }],
    });

    await useAgentStore.getState().selectAgent('agent-1');

    const [, onRtcStateChange] = (transportManager.useWebRTCClient as any).mock.calls[0];

    // First connect, then fail
    onRtcStateChange('connected');
    onRtcStateChange('failed');

    expect(useConnectionStore.getState().state).toBe('disconnected');
    expect(useConnectionStore.getState().webrtcState).toBe('failed');
    expect(useConnectionStore.getState().activeTransport).toBe('websocket');
  });
});
