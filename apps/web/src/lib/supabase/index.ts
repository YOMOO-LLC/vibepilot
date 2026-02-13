/**
 * Supabase client utilities for VibePilot.
 *
 * - Use `createServerClient()` from './server' in Server Components, Server Actions, and Route Handlers
 * - Use the singleton `supabase` from './client' in Client Components
 */

// Re-export the client-side singleton
export { supabase } from './client';

// Re-export the server-side factory function
export { createServerClient } from './server';
