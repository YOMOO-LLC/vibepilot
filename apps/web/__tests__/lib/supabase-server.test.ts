import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Mock Supabase SSR
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('createServerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
  });

  it('should be importable from @/lib/supabase/server', async () => {
    const { createServerClient } = await import('@/lib/supabase/server');
    expect(createServerClient).toBeDefined();
    expect(typeof createServerClient).toBe('function');
  });

  it('should be importable from @/lib/supabase index', async () => {
    // Re-import to get fresh module
    vi.resetModules();
    const module = await import('@/lib/supabase/index');
    expect(module.createServerClient).toBeDefined();
    expect(typeof module.createServerClient).toBe('function');
  });

  it('should create a client with cookies integration', async () => {
    const { cookies } = await import('next/headers');
    const { createServerClient: createSupabaseServerClient } = await import('@supabase/ssr');
    const { createServerClient } = await import('@/lib/supabase/server');

    const mockCookieStore = {
      get: vi.fn((name: string) => ({ value: `cookie-${name}` })),
    };

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any);
    vi.mocked(createSupabaseServerClient).mockReturnValue({} as any);

    await createServerClient();

    expect(cookies).toHaveBeenCalled();
    expect(createSupabaseServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      expect.objectContaining({
        cookies: expect.objectContaining({
          get: expect.any(Function),
        }),
      })
    );
  });

  it('should handle cookie get function correctly', async () => {
    const { cookies } = await import('next/headers');
    const { createServerClient: createSupabaseServerClient } = await import('@supabase/ssr');
    const { createServerClient } = await import('@/lib/supabase/server');

    const mockCookieStore = {
      get: vi.fn((name: string) => {
        if (name === 'test-cookie') {
          return { value: 'test-value' };
        }
        return undefined;
      }),
    };

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any);
    vi.mocked(createSupabaseServerClient).mockReturnValue({} as any);

    await createServerClient();

    // Get the cookies config passed to createSupabaseServerClient
    const callArgs = vi.mocked(createSupabaseServerClient).mock.calls[0];
    const cookiesConfig = callArgs[2]?.cookies as { get: (name: string) => string | undefined };

    expect(cookiesConfig).toBeDefined();
    expect(cookiesConfig.get).toBeDefined();

    // Test the get function
    const getValue = cookiesConfig.get('test-cookie');
    expect(mockCookieStore.get).toHaveBeenCalledWith('test-cookie');
    expect(getValue).toBe('test-value');

    // Test with non-existent cookie
    const noValue = cookiesConfig.get('nonexistent');
    expect(noValue).toBeUndefined();
  });
});
