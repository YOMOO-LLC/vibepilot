import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JWTPayload } from 'jose';

// Use vi.hoisted so mock fns are available inside vi.mock factory (which is hoisted)
const { mockJwtVerify, mockJWKS } = vi.hoisted(() => ({
  mockJwtVerify: vi.fn(),
  mockJWKS: vi.fn(),
}));

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => mockJWKS),
  jwtVerify: mockJwtVerify,
}));

import { SupabaseAuthProvider } from '../../src/auth/SupabaseAuthProvider';
import * as jose from 'jose';

const SUPABASE_URL = 'https://myproject.supabase.co';
const TEST_USER_ID = 'user-abc-123';
const TEST_JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

describe('SupabaseAuthProvider', () => {
  let originalServiceKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  });

  afterEach(() => {
    if (originalServiceKey === undefined) {
      delete process.env.SUPABASE_SERVICE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
    }
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates JWKS URL from supabase URL and strips trailing slash', () => {
      const provider = new SupabaseAuthProvider(`${SUPABASE_URL}/`);

      expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(
        new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
      );
    });

    it('creates JWKS URL from supabase URL without trailing slash', () => {
      const provider = new SupabaseAuthProvider(SUPABASE_URL);

      expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(
        new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
      );
    });
  });

  describe('verify - JWKS path', () => {
    it('returns success with userId when jwt is valid via JWKS', async () => {
      const payload: JWTPayload = { sub: TEST_USER_ID, aud: 'authenticated' };
      mockJwtVerify.mockResolvedValue({ payload, protectedHeader: {} });

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const result = await provider.verify(TEST_JWT);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.error).toBeUndefined();
    });

    it('returns failure when payload has no sub claim', async () => {
      const payload: JWTPayload = { aud: 'authenticated' };
      mockJwtVerify.mockResolvedValue({ payload, protectedHeader: {} });

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const result = await provider.verify(TEST_JWT);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token missing subject claim');
      expect(result.userId).toBeUndefined();
    });

    it('verifies jwt with correct issuer and audience params', async () => {
      const payload: JWTPayload = { sub: TEST_USER_ID };
      mockJwtVerify.mockResolvedValue({ payload, protectedHeader: {} });

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      await provider.verify(TEST_JWT);

      expect(mockJwtVerify).toHaveBeenCalledWith(TEST_JWT, mockJWKS, {
        issuer: `${SUPABASE_URL}/auth/v1`,
        audience: 'authenticated',
      });
    });
  });

  describe('verify - user endpoint fallback', () => {
    it('falls back to /auth/v1/user when JWKS verification fails', async () => {
      mockJwtVerify.mockRejectedValue(new Error('no applicable key found'));

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: TEST_USER_ID, email: 'test@example.com' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const result = await provider.verify(TEST_JWT);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(TEST_USER_ID);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: TEST_JWT,
          Authorization: `Bearer ${TEST_JWT}`,
        },
      });
    });

    it('returns failure when both JWKS and user endpoint fail', async () => {
      mockJwtVerify.mockRejectedValue(new Error('signature verification failed'));

      const mockResponse = { ok: false, status: 401 };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const result = await provider.verify(TEST_JWT);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Auth endpoint returned 401');
    });

    it('returns failure when user endpoint returns no id', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWKS failed'));

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const result = await provider.verify(TEST_JWT);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No user ID in response');
    });

    it('returns failure when user endpoint fetch throws', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWKS failed'));
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const result = await provider.verify(TEST_JWT);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getUserInfo', () => {
    it('returns name and email from Supabase admin API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: 'alice@example.com',
          user_metadata: { full_name: 'Alice Smith' },
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const info = await provider.getUserInfo!(TEST_USER_ID);

      expect(info).toEqual({ name: 'Alice Smith', email: 'alice@example.com' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${SUPABASE_URL}/auth/v1/admin/users/${TEST_USER_ID}`,
        {
          headers: {
            apikey: 'test-service-key',
            Authorization: 'Bearer test-service-key',
          },
        }
      );
    });

    it('prefers user_metadata.full_name over email prefix', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: 'bob@example.com',
          user_metadata: { full_name: 'Robert Johnson' },
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const info = await provider.getUserInfo!(TEST_USER_ID);

      expect(info.name).toBe('Robert Johnson');
      expect(info.email).toBe('bob@example.com');
    });

    it('falls back to email prefix as name when no full_name', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: 'charlie@example.com',
          user_metadata: {},
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const info = await provider.getUserInfo!(TEST_USER_ID);

      expect(info.name).toBe('charlie');
      expect(info.email).toBe('charlie@example.com');
    });

    it('returns empty object on HTTP error', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        json: vi.fn(),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const info = await provider.getUserInfo!(TEST_USER_ID);

      expect(info).toEqual({});
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('returns empty object on fetch failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const provider = new SupabaseAuthProvider(SUPABASE_URL);
      const info = await provider.getUserInfo!(TEST_USER_ID);

      expect(info).toEqual({});
    });
  });
});
