import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock jose for extractUserId used internally
const { mockDecodeJwt } = vi.hoisted(() => ({
  mockDecodeJwt: vi.fn(),
}));

vi.mock('jose', () => ({
  decodeJwt: mockDecodeJwt,
}));

import { SupabaseUserRegistry } from '../../src/registry/SupabaseUserRegistry';

const SUPABASE_URL = 'https://xyz.supabase.co';
const ANON_KEY = 'eyJ.anon-key';
const USER_JWT = 'eyJ.user-access-token';
const TEST_USER_ID = 'uuid-user-123';

describe('SupabaseUserRegistry', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDecodeJwt.mockReturnValue({ sub: TEST_USER_ID });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('uses anonKey as apikey and userJwt as Authorization bearer', async () => {
      const mockRow = {
        id: 'agent-001',
        name: 'my-agent',
        public_url: 'wss://localhost:9800',
        owner_id: TEST_USER_ID,
        status: 'online',
        last_seen: new Date().toISOString(),
      };
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([mockRow]),
      } as unknown as Response);

      const registry = new SupabaseUserRegistry(SUPABASE_URL, ANON_KEY, USER_JWT);
      await registry.register({
        name: 'my-agent',
        publicUrl: 'wss://localhost:9800',
        ownerId: 'ignored', // should be overridden by JWT sub
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents`);
      expect((init as any).headers.apikey).toBe(ANON_KEY);
      expect((init as any).headers.Authorization).toBe(`Bearer ${USER_JWT}`);
    });

    it('auto-extracts owner_id from JWT sub claim', async () => {
      const mockRow = {
        id: 'agent-001',
        name: 'my-agent',
        public_url: 'wss://localhost:9800',
        owner_id: TEST_USER_ID,
        status: 'online',
        last_seen: new Date().toISOString(),
      };
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([mockRow]),
      } as unknown as Response);

      const registry = new SupabaseUserRegistry(SUPABASE_URL, ANON_KEY, USER_JWT);
      const result = await registry.register({
        name: 'my-agent',
        publicUrl: 'wss://localhost:9800',
        ownerId: 'should-be-overridden',
      });

      // Verify the body contains the JWT's sub as owner_id
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(body.owner_id).toBe(TEST_USER_ID);
      expect(result.ownerId).toBe(TEST_USER_ID);
    });

    it('throws when JWT has no sub claim', () => {
      mockDecodeJwt.mockReturnValue({ aud: 'authenticated' });

      expect(() => new SupabaseUserRegistry(SUPABASE_URL, ANON_KEY, USER_JWT)).toThrow(
        'JWT missing sub claim'
      );
    });
  });

  describe('heartbeat', () => {
    it('uses correct headers', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
      } as unknown as Response);

      const registry = new SupabaseUserRegistry(SUPABASE_URL, ANON_KEY, USER_JWT);
      await registry.heartbeat('agent-001');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents?id=eq.agent-001`);
      expect((init as any).headers.apikey).toBe(ANON_KEY);
      expect((init as any).headers.Authorization).toBe(`Bearer ${USER_JWT}`);
    });
  });

  describe('unregister', () => {
    it('uses correct headers', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
      } as unknown as Response);

      const registry = new SupabaseUserRegistry(SUPABASE_URL, ANON_KEY, USER_JWT);
      await registry.unregister('agent-001');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents?id=eq.agent-001`);
      expect((init as any).headers.apikey).toBe(ANON_KEY);
      expect((init as any).headers.Authorization).toBe(`Bearer ${USER_JWT}`);
    });
  });
});
