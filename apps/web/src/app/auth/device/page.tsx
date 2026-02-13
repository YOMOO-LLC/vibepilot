import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DeviceAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If already logged in, redirect to callback
  if (session) {
    redirect(`/auth/device/callback?port=${params.port || '19876'}`);
  }

  // If not logged in, redirect to login page
  redirect(`/auth/login?redirect=/auth/device/callback&port=${params.port || '19876'}`);
}
