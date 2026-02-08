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

const { mockSupabaseAuth } = vi.hoisted(() => {
  const mockSupabaseAuth = {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  };
  return { mockSupabaseAuth };
});

vi.mock('@/lib/transport', () => ({
  transportManager: mockTransportManager,
  TransportManager: vi.fn(),
}));

vi.mock('@/lib/websocket', () => ({
  wsClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    state: 'disconnected',
  },
  VPWebSocketClient: vi.fn(),
}));

vi.mock('@/lib/webrtc', () => ({
  VPWebRTCClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: mockSupabaseAuth,
  },
}));

import { useAuthStore } from '@/stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      authMode: 'none',
      isAuthenticated: false,
      userEmail: null,
      loading: false,
      error: null,
    });
  });

  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.authMode).toBe('none');
    expect(state.isAuthenticated).toBe(false);
    expect(state.userEmail).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('setToken stores token and marks as authenticated', () => {
    useAuthStore.getState().setToken('vp_my_secret_token');

    const state = useAuthStore.getState();
    expect(state.token).toBe('vp_my_secret_token');
    expect(state.authMode).toBe('token');
    expect(state.isAuthenticated).toBe(true);
  });

  it('setToken persists to localStorage', () => {
    useAuthStore.getState().setToken('vp_persist_me');

    expect(localStorage.getItem('vp:token')).toBe('vp_persist_me');
    expect(localStorage.getItem('vp:authMode')).toBe('token');
  });

  it('restoreSession loads token from localStorage', () => {
    localStorage.setItem('vp:token', 'vp_saved_token');
    localStorage.setItem('vp:authMode', 'token');

    useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.token).toBe('vp_saved_token');
    expect(state.authMode).toBe('token');
    expect(state.isAuthenticated).toBe(true);
  });

  it('restoreSession does nothing when no saved token', () => {
    useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('clearAuth removes token and clears localStorage', () => {
    useAuthStore.getState().setToken('vp_temp_token');
    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.authMode).toBe('none');
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem('vp:token')).toBeNull();
    expect(localStorage.getItem('vp:authMode')).toBeNull();
  });

  it('getWsUrl appends token to base URL', () => {
    useAuthStore.getState().setToken('vp_url_token');

    const url = useAuthStore.getState().getWsUrl('ws://localhost:9800');
    expect(url).toBe('ws://localhost:9800?token=vp_url_token');
  });

  it('getWsUrl returns base URL when no token', () => {
    const url = useAuthStore.getState().getWsUrl('ws://localhost:9800');
    expect(url).toBe('ws://localhost:9800');
  });

  it('getWsUrl appends token to URL with existing query params', () => {
    useAuthStore.getState().setToken('vp_token');

    const url = useAuthStore.getState().getWsUrl('ws://localhost:9800?foo=bar');
    expect(url).toBe('ws://localhost:9800?foo=bar&token=vp_token');
  });

  // --- Supabase auth tests ---

  describe('supabaseLogin', () => {
    it('sets token and user email on successful login', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: {
          session: {
            access_token: 'sb-jwt-token',
            user: { email: 'test@example.com' },
          },
        },
        error: null,
      });

      const result = await useAuthStore.getState().supabaseLogin('test@example.com', 'pass123');

      expect(result).toBe(true);
      const state = useAuthStore.getState();
      expect(state.token).toBe('sb-jwt-token');
      expect(state.authMode).toBe('supabase');
      expect(state.isAuthenticated).toBe(true);
      expect(state.userEmail).toBe('test@example.com');
      expect(state.loading).toBe(false);
      expect(localStorage.getItem('vp:authMode')).toBe('supabase');
    });

    it('sets error on failed login', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid credentials' },
      });

      const result = await useAuthStore.getState().supabaseLogin('bad@example.com', 'wrong');

      expect(result).toBe(false);
      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid credentials');
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
    });

    it('sets loading state during login', async () => {
      let resolveLogin: (value: any) => void;
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });
      mockSupabaseAuth.signInWithPassword.mockReturnValue(loginPromise);

      const loginResultPromise = useAuthStore.getState().supabaseLogin('test@example.com', 'pass');

      // During the login
      expect(useAuthStore.getState().loading).toBe(true);

      resolveLogin!({
        data: {
          session: { access_token: 'token', user: { email: 'test@example.com' } },
        },
        error: null,
      });

      await loginResultPromise;
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  describe('supabaseSignUp', () => {
    it('returns true on successful sign up', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: { email: 'new@example.com' } },
        error: null,
      });

      const result = await useAuthStore.getState().supabaseSignUp('new@example.com', 'pass123');

      expect(result).toBe(true);
      expect(useAuthStore.getState().error).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('sets error on failed sign up', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: {},
        error: { message: 'User already exists' },
      });

      const result = await useAuthStore.getState().supabaseSignUp('dup@example.com', 'pass');

      expect(result).toBe(false);
      expect(useAuthStore.getState().error).toBe('User already exists');
    });
  });

  describe('supabaseOAuthLogin', () => {
    it('calls signInWithOAuth with the provider', async () => {
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({ error: null });

      await useAuthStore.getState().supabaseOAuthLogin('github');

      expect(mockSupabaseAuth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'github' });
    });

    it('sets error on OAuth failure', async () => {
      mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
        error: { message: 'OAuth provider error' },
      });

      await useAuthStore.getState().supabaseOAuthLogin('google');

      expect(useAuthStore.getState().error).toBe('OAuth provider error');
    });
  });

  describe('initSupabaseListener', () => {
    it('registers onAuthStateChange listener', () => {
      useAuthStore.getState().initSupabaseListener();

      expect(mockSupabaseAuth.onAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it('updates state when session changes', () => {
      useAuthStore.getState().initSupabaseListener();

      // Get the callback passed to onAuthStateChange
      const callback = mockSupabaseAuth.onAuthStateChange.mock.calls[0][0];

      // Simulate session change
      callback('SIGNED_IN', {
        access_token: 'new-jwt',
        user: { email: 'user@example.com' },
      });

      const state = useAuthStore.getState();
      expect(state.token).toBe('new-jwt');
      expect(state.isAuthenticated).toBe(true);
      expect(state.userEmail).toBe('user@example.com');
      expect(state.authMode).toBe('supabase');
    });

    it('clears state when session is removed (in supabase mode)', () => {
      // First set up supabase session
      useAuthStore.setState({
        token: 'old-jwt',
        authMode: 'supabase',
        isAuthenticated: true,
        userEmail: 'user@example.com',
      });

      useAuthStore.getState().initSupabaseListener();
      const callback = mockSupabaseAuth.onAuthStateChange.mock.calls[0][0];

      // Simulate sign out
      callback('SIGNED_OUT', null);

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.userEmail).toBeNull();
    });
  });

  describe('restoreSession (supabase mode)', () => {
    it('restores session from Supabase SDK when authMode is supabase', async () => {
      localStorage.setItem('vp:authMode', 'supabase');

      mockSupabaseAuth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'restored-jwt',
            user: { email: 'restored@example.com' },
          },
        },
      });

      useAuthStore.getState().restoreSession();

      // Wait for async getSession to resolve
      await vi.waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
      });

      const state = useAuthStore.getState();
      expect(state.token).toBe('restored-jwt');
      expect(state.authMode).toBe('supabase');
      expect(state.userEmail).toBe('restored@example.com');
    });

    it('does not authenticate when no Supabase session exists', async () => {
      localStorage.setItem('vp:authMode', 'supabase');

      mockSupabaseAuth.getSession.mockResolvedValue({
        data: { session: null },
      });

      useAuthStore.getState().restoreSession();

      await vi.waitFor(() => {
        expect(useAuthStore.getState().loading).toBe(false);
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('clearAuth (supabase mode)', () => {
    it('calls supabase signOut when in supabase mode', () => {
      useAuthStore.setState({
        token: 'sb-jwt',
        authMode: 'supabase',
        isAuthenticated: true,
      });

      useAuthStore.getState().clearAuth();

      expect(mockSupabaseAuth.signOut).toHaveBeenCalledTimes(1);
    });

    it('does not call supabase signOut when in token mode', () => {
      useAuthStore.setState({
        token: 'vp_token',
        authMode: 'token',
        isAuthenticated: true,
      });

      useAuthStore.getState().clearAuth();

      expect(mockSupabaseAuth.signOut).not.toHaveBeenCalled();
    });
  });
});
