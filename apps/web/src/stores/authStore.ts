import { create } from 'zustand';

export type AuthMode = 'none' | 'token' | 'supabase';

interface AuthStore {
  token: string | null;
  authMode: AuthMode;
  isAuthenticated: boolean;

  setToken: (token: string) => void;
  restoreSession: () => void;
  clearAuth: () => void;
  getWsUrl: (baseUrl: string) => string;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  authMode: 'none' as AuthMode,
  isAuthenticated: false,

  setToken: (token: string) => {
    set({ token, authMode: 'token', isAuthenticated: true });

    if (typeof window !== 'undefined') {
      localStorage.setItem('vp:token', token);
      localStorage.setItem('vp:authMode', 'token');
    }
  },

  restoreSession: () => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('vp:token');
    const authMode = localStorage.getItem('vp:authMode') as AuthMode | null;

    if (token && authMode) {
      set({ token, authMode, isAuthenticated: true });
    }
  },

  clearAuth: () => {
    set({ token: null, authMode: 'none', isAuthenticated: false });

    if (typeof window !== 'undefined') {
      localStorage.removeItem('vp:token');
      localStorage.removeItem('vp:authMode');
    }
  },

  getWsUrl: (baseUrl: string): string => {
    const { token } = get();
    if (!token) return baseUrl;

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}token=${token}`;
  },
}));
