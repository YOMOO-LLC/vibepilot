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

import { useAuthStore } from '@/stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      authMode: 'none',
      isAuthenticated: false,
    });
  });

  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.authMode).toBe('none');
    expect(state.isAuthenticated).toBe(false);
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
});
