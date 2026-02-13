import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client for use in Next.js 15 Server Components.
 *
 * This client uses the Next.js cookies API to manage authentication state
 * across server-side requests. It should only be used in Server Components,
 * Server Actions, and Route Handlers.
 *
 * @returns A typed Supabase client configured for server-side use
 *
 * @example
 * ```typescript
 * // In a Server Component
 * import { createServerClient } from '@/lib/supabase/server';
 *
 * export default async function Page() {
 *   const supabase = await createServerClient();
 *   const { data } = await supabase.from('agents').select('*');
 *   return <div>{data?.length} agents</div>;
 * }
 * ```
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}
