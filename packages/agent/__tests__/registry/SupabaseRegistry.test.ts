import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseRegistry } from '../../src/registry/SupabaseRegistry';
import type { AgentInfo } from '../../src/registry/AgentRegistry';

const SUPABASE_URL = 'https://test.supabase.co';
const SUPABASE_KEY = 'test-service-key';

/** Helper to build a mock Response with ok, status, json(), text() */
function mockResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

/** Canonical row as returned by the Supabase REST API (snake_case) */
function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'agent-uuid-1',
    name: 'Home Mac',
    public_url: 'wss://home.example.com:9800',
    owner_id: 'user-1',
    status: 'online',
    last_seen: '2025-06-01T00:00:00.000Z',
    version: '0.1.0',
    platform: 'darwin-arm64',
    metadata: { foo: 'bar' },
    ...overrides,
  };
}

/** Expected AgentInfo after snake_case -> camelCase mapping */
function expectedAgentInfo(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-uuid-1',
    name: 'Home Mac',
    publicUrl: 'wss://home.example.com:9800',
    ownerId: 'user-1',
    status: 'online',
    lastSeen: new Date('2025-06-01T00:00:00.000Z').getTime(),
    version: '0.1.0',
    platform: 'darwin-arm64',
    metadata: { foo: 'bar' },
    ...overrides,
  };
}

describe('SupabaseRegistry', () => {
  let registry: SupabaseRegistry;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    registry = new SupabaseRegistry(SUPABASE_URL, SUPABASE_KEY);
  });

  // ──────────────────────────── constructor ────────────────────────────

  describe('constructor', () => {
    it('strips trailing slash from URL', async () => {
      const reg = new SupabaseRegistry('https://test.supabase.co/', SUPABASE_KEY);

      fetchMock.mockResolvedValue(mockResponse([makeDbRow()]));
      await reg.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^https:\/\/test\.supabase\.co\/rest/);
      expect(calledUrl).not.toContain('//rest');
    });
  });

  // ──────────────────────────── register ────────────────────────────

  describe('register', () => {
    it('sends POST to /rest/v1/agents with correct body and headers', async () => {
      const row = makeDbRow();
      fetchMock.mockResolvedValue(mockResponse([row]));

      await registry.register({
        name: 'Home Mac',
        publicUrl: 'wss://home.example.com:9800',
        ownerId: 'user-1',
        version: '0.1.0',
        platform: 'darwin-arm64',
        metadata: { foo: 'bar' },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents`);
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.name).toBe('Home Mac');
      expect(body.public_url).toBe('wss://home.example.com:9800');
      expect(body.owner_id).toBe('user-1');
      expect(body.status).toBe('online');
      expect(body.last_seen).toBeDefined();
      expect(body.version).toBe('0.1.0');
      expect(body.platform).toBe('darwin-arm64');
      expect(body.metadata).toEqual({ foo: 'bar' });
    });

    it('includes apikey and Authorization headers', async () => {
      fetchMock.mockResolvedValue(mockResponse([makeDbRow()]));

      await registry.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['apikey']).toBe(SUPABASE_KEY);
      expect(headers['Authorization']).toBe(`Bearer ${SUPABASE_KEY}`);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('uses Prefer header for upsert (merge-duplicates)', async () => {
      fetchMock.mockResolvedValue(mockResponse([makeDbRow()]));

      await registry.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['Prefer']).toBe('return=representation,resolution=merge-duplicates');
    });

    it('maps response to AgentInfo (snake_case to camelCase)', async () => {
      const row = makeDbRow();
      fetchMock.mockResolvedValue(mockResponse([row]));

      const result = await registry.register({
        name: 'Home Mac',
        publicUrl: 'wss://home.example.com:9800',
        ownerId: 'user-1',
        version: '0.1.0',
        platform: 'darwin-arm64',
        metadata: { foo: 'bar' },
      });

      expect(result).toEqual(expectedAgentInfo());
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue(mockResponse('duplicate key', { status: 409, ok: false }));

      await expect(
        registry.register({
          name: 'Test',
          publicUrl: 'wss://test.com:9800',
          ownerId: 'user-1',
        })
      ).rejects.toThrow('Failed to register agent: 409');
    });

    it('sends null for optional fields when not provided', async () => {
      fetchMock.mockResolvedValue(
        mockResponse([makeDbRow({ version: null, platform: null, metadata: {} })])
      );

      await registry.register({
        name: 'Minimal',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.version).toBeNull();
      expect(body.platform).toBeNull();
      expect(body.metadata).toEqual({});
    });
  });

  // ──────────────────────────── heartbeat ────────────────────────────

  describe('heartbeat', () => {
    it('sends PATCH to /rest/v1/agents?id=eq.{agentId}', async () => {
      fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));

      await registry.heartbeat('agent-uuid-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents?id=eq.agent-uuid-1`);
      expect(init.method).toBe('PATCH');
    });

    it('sends status=online and last_seen', async () => {
      fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));

      await registry.heartbeat('agent-uuid-1');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.status).toBe('online');
      expect(body.last_seen).toBeDefined();
      // Verify last_seen is a valid ISO timestamp
      expect(new Date(body.last_seen).toISOString()).toBe(body.last_seen);
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue(mockResponse('not found', { status: 404, ok: false }));

      await expect(registry.heartbeat('agent-uuid-1')).rejects.toThrow('Heartbeat failed: 404');
    });
  });

  // ──────────────────────────── unregister ────────────────────────────

  describe('unregister', () => {
    it('sends PATCH with status=offline', async () => {
      fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));

      await registry.unregister('agent-uuid-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents?id=eq.agent-uuid-1`);
      expect(init.method).toBe('PATCH');

      const body = JSON.parse(init.body);
      expect(body.status).toBe('offline');
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue(mockResponse('server error', { status: 500, ok: false }));

      await expect(registry.unregister('agent-uuid-1')).rejects.toThrow('Unregister failed: 500');
    });
  });

  // ──────────────────────────── listByOwner ────────────────────────────

  describe('listByOwner', () => {
    it('sends GET with owner_id filter and order by last_seen desc', async () => {
      fetchMock.mockResolvedValue(mockResponse([]));

      await registry.listByOwner('user-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents?owner_id=eq.user-1&order=last_seen.desc`);
      expect(init.method).toBe('GET');
    });

    it('maps all results to AgentInfo[]', async () => {
      const rows = [
        makeDbRow({ id: 'a1', name: 'Agent 1' }),
        makeDbRow({ id: 'a2', name: 'Agent 2' }),
      ];
      fetchMock.mockResolvedValue(mockResponse(rows));

      const result = await registry.listByOwner('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expectedAgentInfo({ id: 'a1', name: 'Agent 1' }));
      expect(result[1]).toEqual(expectedAgentInfo({ id: 'a2', name: 'Agent 2' }));
    });

    it('returns empty array when API returns empty array', async () => {
      fetchMock.mockResolvedValue(mockResponse([]));

      const result = await registry.listByOwner('user-1');

      expect(result).toEqual([]);
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue(mockResponse('unauthorized', { status: 401, ok: false }));

      await expect(registry.listByOwner('user-1')).rejects.toThrow('List agents failed: 401');
    });
  });

  // ──────────────────────────── get ────────────────────────────

  describe('get', () => {
    it('sends GET with id filter and singular Accept header', async () => {
      const row = makeDbRow();
      fetchMock.mockResolvedValue(mockResponse(row));

      await registry.get('agent-uuid-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUPABASE_URL}/rest/v1/agents?id=eq.agent-uuid-1`);
      expect(init.method).toBe('GET');
      expect(init.headers['Accept']).toBe('application/vnd.pgrst.object+json');
    });

    it('maps result to AgentInfo on success', async () => {
      const row = makeDbRow();
      fetchMock.mockResolvedValue(mockResponse(row));

      const result = await registry.get('agent-uuid-1');

      expect(result).toEqual(expectedAgentInfo());
    });

    it('returns null on 406 (not found)', async () => {
      fetchMock.mockResolvedValue(mockResponse(null, { status: 406, ok: false }));

      const result = await registry.get('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null on other non-OK responses', async () => {
      fetchMock.mockResolvedValue(mockResponse(null, { status: 500, ok: false }));

      const result = await registry.get('agent-uuid-1');

      expect(result).toBeNull();
    });
  });
});
