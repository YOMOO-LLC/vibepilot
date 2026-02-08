import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type AuthMode = 'none' | 'token' | 'supabase';

interface AuthStore {
  token: string | null;
  authMode: AuthMode;
  isAuthenticated: boolean;
  userEmail: string | null;
  loading: boolean;
  error: string | null;

  setToken: (token: string) => void;
  restoreSession: () => void;
  clearAuth: () => void;
  getWsUrl: (baseUrl: string) => string;

  // Supabase-specific
  supabaseLogin: (email: string, password: string) => Promise<boolean>;
  supabaseSignUp: (email: string, password: string) => Promise<boolean>;
  supabaseOAuthLogin: (provider: 'github' | 'google') => Promise<void>;
  initSupabaseListener: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  authMode: 'none' as AuthMode,
  isAuthenticated: false,
  userEmail: null,
  loading: false,
  error: null,

  setToken: (token: string) => {
    set({ token, authMode: 'token', isAuthenticated: true, error: null });

    if (typeof window !== 'undefined') {
      localStorage.setItem('vp:token', token);
      localStorage.setItem('vp:authMode', 'token');
    }
  },

  restoreSession: () => {
    if (typeof window === 'undefined') return;

    const authMode = localStorage.getItem('vp:authMode') as AuthMode | null;

    if (authMode === 'token') {
      const token = localStorage.getItem('vp:token');
      if (token) {
        set({ token, authMode: 'token', isAuthenticated: true });
      }
    } else if (authMode === 'supabase' && supabase) {
      // Supabase SDK handles session persistence internally.
      // The initSupabaseListener will set state when session is available.
      set({ loading: true });
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          set({
            token: session.access_token,
            authMode: 'supabase',
            isAuthenticated: true,
            userEmail: session.user.email || null,
            loading: false,
          });
        } else {
          set({ loading: false });
        }
      });
    }
  },

  clearAuth: () => {
    const { authMode } = get();

    if (authMode === 'supabase' && supabase) {
      supabase.auth.signOut();
    }

    set({ token: null, authMode: 'none', isAuthenticated: false, userEmail: null, error: null });

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

  supabaseLogin: async (email: string, password: string): Promise<boolean> => {
    if (!supabase) {
      set({ error: 'Supabase not configured' });
      return false;
    }

    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }

    if (data.session) {
      set({
        token: data.session.access_token,
        authMode: 'supabase',
        isAuthenticated: true,
        userEmail: data.session.user.email || null,
        loading: false,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('vp:authMode', 'supabase');
      }
      return true;
    }

    set({ loading: false, error: 'No session returned' });
    return false;
  },

  supabaseSignUp: async (email: string, password: string): Promise<boolean> => {
    if (!supabase) {
      set({ error: 'Supabase not configured' });
      return false;
    }

    set({ loading: true, error: null });

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }

    set({ loading: false, error: null });
    return true;
  },

  supabaseOAuthLogin: async (provider: 'github' | 'google'): Promise<void> => {
    if (!supabase) {
      set({ error: 'Supabase not configured' });
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({ provider });

    if (error) {
      set({ error: error.message });
    }
  },

  initSupabaseListener: () => {
    if (!supabase) return;

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        set({
          token: session.access_token,
          authMode: 'supabase',
          isAuthenticated: true,
          userEmail: session.user.email || null,
          loading: false,
        });

        if (typeof window !== 'undefined') {
          localStorage.setItem('vp:authMode', 'supabase');
        }
      } else {
        // Only clear if we were in supabase mode
        if (get().authMode === 'supabase') {
          set({
            token: null,
            isAuthenticated: false,
            userEmail: null,
            loading: false,
          });
        }
      }
    });
  },
}));
