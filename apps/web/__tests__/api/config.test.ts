import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/config/route';

describe('GET /api/config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-123';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns supabaseUrl and anonKey when env vars are set', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      supabaseUrl: 'https://test.supabase.co',
      anonKey: 'test-anon-key-123',
    });
  });

  it('returns 503 when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'Cloud configuration not available' });
  });

  it('includes Cache-Control header on success', async () => {
    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
