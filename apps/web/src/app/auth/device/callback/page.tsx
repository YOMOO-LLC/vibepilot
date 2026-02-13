import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DeviceAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect('/auth/login?error=unauthorized');
  }

  // From Vercel environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.errorTitle}>Configuration Error</h1>
          <p style={styles.text}>Supabase environment variables are not configured.</p>
          <p style={styles.subtext}>Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  // Validate and sanitize port (SSRF prevention)
  const portStr = params.port || '19876';
  const port = parseInt(portStr, 10);
  if (!port || port < 19800 || port > 19899) {
    redirect('/auth/login?error=invalid_port');
  }
  const callbackParams = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token!,
    expires_at: String(session.expires_at),
    user_id: session.user.id,
    supabase_url: supabaseUrl,
    anon_key: anonKey,
  });

  let success = false;
  let errorMessage = '';

  try {
    const response = await fetch(`http://localhost:${port}/callback?${callbackParams}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      success = true;
    } else {
      errorMessage = `Agent callback failed: ${response.status}`;
    }
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? `Failed to connect to agent: ${error.message}`
        : 'Failed to connect to agent';
  }

  if (success) {
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
        <p style={styles.text}>{errorMessage}</p>
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
