'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { supabase } from '@/lib/supabase';

type PageState = 'loading' | 'error' | 'login' | 'confirm' | 'success';

interface SessionInfo {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const port = searchParams.get('port');
  const state = searchParams.get('state');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Validate parameters
  if (!port || !state) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.errorTitle}>Missing required parameters</h1>
          <p style={styles.text}>
            This page should be opened from the <code>vibepilot auth login</code> command.
          </p>
        </div>
      </div>
    );
  }

  // Check for existing session on mount
  useEffect(() => {
    if (!supabase) {
      setPageState('error');
      setError('Supabase not configured');
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession({
          accessToken: s.access_token,
          refreshToken: s.refresh_token,
          expiresIn: s.expires_in ?? 3600,
          email: s.user.email || '',
        });
        setPageState('confirm');
      } else {
        setPageState('login');
      }
    });
  }, []);

  const handleLogin = useCallback(async () => {
    if (!supabase) return;
    setError('');

    const action = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });

    const { data, error: authError } = await action;

    if (authError) {
      setError(authError.message);
      return;
    }

    if (isSignUp) {
      setError('Check your email for a confirmation link, then log in.');
      setIsSignUp(false);
      return;
    }

    if (data.session) {
      setSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in ?? 3600,
        email: data.session.user.email || '',
      });
      setPageState('confirm');
    }
  }, [email, password, isSignUp]);

  const handleConfirm = useCallback(async () => {
    if (!session) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    const params = new URLSearchParams({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_in: String(session.expiresIn),
      state: state!,
      supabase_url: supabaseUrl,
      anon_key: anonKey,
    });

    const callbackUrl = `http://localhost:${port}/callback?${params}`;

    try {
      const response = await fetch(callbackUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data as any).error || `Callback failed: ${response.status}`);
        return;
      }

      setPageState('success');
      // Navigate to the main app after a brief delay so user sees the success message
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      setError(`Failed to connect to agent CLI: ${err.message}`);
    }
  }, [session, port, state]);

  if (pageState === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.text}>Loading...</p>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.errorTitle}>Error</h1>
          <p style={styles.text}>{error}</p>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.successTitle}>Authentication Successful</h1>
          <p style={styles.text}>Redirecting to your workspace...</p>
        </div>
      </div>
    );
  }

  if (pageState === 'confirm') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Link this account to your agent?</h1>
          <p style={styles.text}>
            Logged in as <strong>{session?.email}</strong>
          </p>
          <p style={styles.subtext}>
            This will allow your VibePilot agent to register under your account.
          </p>
          <div style={styles.buttonRow}>
            <button style={styles.confirmButton} onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Login form
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>VibePilot Agent Authentication</h1>
        <p style={styles.subtext}>
          {isSignUp ? 'Create an account' : 'Sign in'} to link your agent.
        </p>

        {error && <p style={styles.errorText}>{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />

        <button style={styles.primaryButton} onClick={handleLogin}>
          {isSignUp ? 'Sign Up' : 'Sign In'}
        </button>

        <button
          style={styles.linkButton}
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError('');
          }}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </div>
    </div>
  );
}

export default function DeviceAuthPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={styles.text}>Loading...</p>
          </div>
        </div>
      }
    >
      <DeviceAuthContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#0a0a0a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    background: '#1a1a1a',
    borderRadius: '12px',
    padding: '2rem',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },
  title: {
    color: '#e5e5e5',
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem',
    textAlign: 'center' as const,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem',
    textAlign: 'center' as const,
  },
  successTitle: {
    color: '#22c55e',
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.5rem',
    textAlign: 'center' as const,
  },
  text: {
    color: '#a3a3a3',
    textAlign: 'center' as const,
    margin: '0.5rem 0',
  },
  subtext: {
    color: '#737373',
    fontSize: '0.875rem',
    textAlign: 'center' as const,
    margin: '0 0 1.5rem',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '0.875rem',
    textAlign: 'center' as const,
    margin: '0 0 1rem',
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '0.75rem',
    marginBottom: '0.75rem',
    border: '1px solid #333',
    borderRadius: '8px',
    background: '#0a0a0a',
    color: '#e5e5e5',
    fontSize: '0.875rem',
    boxSizing: 'border-box' as const,
  },
  primaryButton: {
    display: 'block',
    width: '100%',
    padding: '0.75rem',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: 'white',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '0.75rem',
  },
  confirmButton: {
    padding: '0.75rem 2rem',
    border: 'none',
    borderRadius: '8px',
    background: '#22c55e',
    color: 'white',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  linkButton: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: '#3b82f6',
    fontSize: '0.875rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '1rem',
  },
};
