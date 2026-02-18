'use client';

import { useEffect, useState } from 'react';

interface Props {
  port: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
  supabaseUrl: string;
  anonKey: string;
}

export default function DeviceAuthCallbackClient({
  port,
  accessToken,
  refreshToken,
  expiresAt,
  userId,
  supabaseUrl,
  anonKey,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const callbackParams = new URLSearchParams({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      user_id: userId,
      supabase_url: supabaseUrl,
      anon_key: anonKey,
    });

    fetch(`http://localhost:${port}/callback?${callbackParams}`, {
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (res.ok) {
          setStatus('success');
        } else {
          setError(`Agent callback failed: ${res.status}`);
          setStatus('error');
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? `Failed to connect to agent: ${err.message}`
            : 'Failed to connect to agent'
        );
        setStatus('error');
      });
  }, []);

  if (status === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Connecting to Agent...</h1>
          <p style={styles.text}>Sending authentication to your local VibePilot agent.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.successTitle}>Authentication Successful</h1>
          <p style={styles.text}>You can close this page and return to your terminal.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.errorTitle}>Authentication Failed</h1>
        <p style={styles.text}>{error}</p>
        <p style={styles.subtext}>Please ensure your VibePilot agent is running.</p>
      </div>
    </div>
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
    color: '#a3a3a3',
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
  errorTitle: {
    color: '#ef4444',
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
    margin: '0.5rem 0 0',
  },
};
