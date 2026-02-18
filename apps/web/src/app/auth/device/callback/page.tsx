import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DeviceAuthCallbackClient from './client';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return (
      <div>
        <h1>Configuration Error</h1>
        <p>Supabase environment variables are not configured.</p>
      </div>
    );
  }

  // Validate and sanitize port (SSRF prevention)
  const portStr = params.port || '19876';
  const port = parseInt(portStr, 10);
  if (!port || port < 19800 || port > 19899) {
    redirect('/auth/login?error=invalid_port');
  }

  return (
    <DeviceAuthCallbackClient
      port={port}
      accessToken={session.access_token}
      refreshToken={session.refresh_token!}
      expiresAt={String(session.expires_at)}
      userId={session.user.id}
      supabaseUrl={supabaseUrl}
      anonKey={anonKey}
    />
  );
}
