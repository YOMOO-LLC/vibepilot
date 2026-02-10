import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Hoisted mocks ───────────────────────────────────────────
const { mockGetSession, mockSignInWithPassword, mockSignUp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

// Track searchParams via a mutable object that hoisted mocks can access
const { params } = vi.hoisted(() => ({
  params: { port: '', state: '' },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => params[key as keyof typeof params] || null,
  }),
}));

import DeviceAuthPage from '../../../src/app/auth/device/page';

describe('DeviceAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params.port = '';
    params.state = '';
  });

  it('shows error when port or state is missing', () => {
    render(<DeviceAuthPage />);
    expect(screen.getByText(/Missing required parameters/i)).toBeTruthy();
  });

  it('shows login form when not authenticated', async () => {
    params.port = '19850';
    params.state = 'test-state';
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<DeviceAuthPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/password/i)).toBeTruthy();
    });
  });

  it('shows confirm screen when already authenticated', async () => {
    params.port = '19850';
    params.state = 'test-state';
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          expires_in: 3600,
          user: { email: 'user@example.com' },
        },
      },
    });

    render(<DeviceAuthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Link this account/i)).toBeTruthy();
      expect(screen.getByText(/user@example.com/i)).toBeTruthy();
    });
  });

  it('sends fetch callback and shows success on confirm', async () => {
    params.port = '19850';
    params.state = 'test-state-123';
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-access',
          refresh_token: 'test-refresh',
          expires_in: 3600,
          user: { email: 'user@example.com' },
        },
      },
    });

    // Mock fetch for the callback
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    render(<DeviceAuthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Link this account/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:19850/callback'),
        expect.objectContaining({ headers: { Accept: 'application/json' } })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Authentication Successful/i)).toBeTruthy();
      expect(screen.getByText(/Redirecting/i)).toBeTruthy();
    });

    fetchSpy.mockRestore();
  });
});
