import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DeviceAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Validate required parameters
  if (!params.port || !params.state) {
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

  const supabase = await createServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If already logged in, redirect to callback
  if (session) {
    redirect(`/auth/device/callback?port=${params.port}&state=${params.state}`);
  }

  // If not logged in, redirect to login page (will be created in a future task)
  // For now, show a message that login page is not yet implemented
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>VibePilot Agent Authentication</h1>
        <p style={styles.text}>Login page not yet implemented.</p>
        <p style={styles.subtext}>
          This will redirect to /auth/login in the future. For now, please authenticate through the
          web interface first.
        </p>
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
