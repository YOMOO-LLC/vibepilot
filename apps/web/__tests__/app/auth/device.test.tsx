import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────
const { mockGetSession, mockRedirect, mockCreateServerClient } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn(),
  mockCreateServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

import DeviceAuthPage from '../../../src/app/auth/device/page';

describe('DeviceAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockResolvedValue({
      auth: {
        getSession: mockGetSession,
      },
    });
    // redirect throws in Next.js to halt execution; simulate that
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it('redirects to callback when session exists', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          user: { email: 'user@example.com' },
        },
      },
    });

    await expect(
      DeviceAuthPage({ searchParams: Promise.resolve({ port: '19850' }) })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/auth/device/callback?port=19850');
  });

  it('redirects to login when not authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await expect(
      DeviceAuthPage({ searchParams: Promise.resolve({ port: '19850' }) })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/login?redirect=/auth/device/callback&port=19850'
    );
  });

  it('uses default port 19876 when port is not provided', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await expect(DeviceAuthPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT'
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/login?redirect=/auth/device/callback&port=19876'
    );
  });

  it('redirects to callback with default port when session exists and no port given', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          user: { email: 'user@example.com' },
        },
      },
    });

    await expect(DeviceAuthPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT'
    );

    expect(mockRedirect).toHaveBeenCalledWith('/auth/device/callback?port=19876');
  });
});
