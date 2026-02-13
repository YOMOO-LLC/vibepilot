import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Singleton — avoid creating a new client on every import
const SUPABASE_KEY = Symbol.for('vp-supabase-client');
const g = globalThis as any;

function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!g[SUPABASE_KEY]) {
    g[SUPABASE_KEY] = createClient(supabaseUrl, supabaseAnonKey);
  }
  return g[SUPABASE_KEY];
}

export const supabase = getSupabaseClient();
