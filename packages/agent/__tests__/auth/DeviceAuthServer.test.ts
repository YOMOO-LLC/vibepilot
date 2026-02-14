import { describe, it, expect, afterEach } from 'vitest';
import { DeviceAuthServer } from '../../src/auth/DeviceAuthServer';

const CLOUD_URL = 'https://vibepilot.dev';

describe('DeviceAuthServer', () => {
  let server: DeviceAuthServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  describe('start', () => {
    it('binds to a port and returns authUrl with port', async () => {
      server = new DeviceAuthServer();
      const result = await server.start(CLOUD_URL);

      expect(result.port).toBeGreaterThanOrEqual(19800);
      expect(result.port).toBeLessThanOrEqual(19899);

      const url = new URL(result.authUrl);
      expect(url.origin).toBe(CLOUD_URL);
      expect(url.pathname).toBe('/auth/device');
      expect(url.searchParams.get('port')).toBe(String(result.port));
    });
  });

  describe('waitForCallback', () => {
    it('resolves with tokens when receiving a valid callback', async () => {
      server = new DeviceAuthServer();
      const { port } = await server.start(CLOUD_URL);

      const callbackPromise = server.waitForCallback(5000);

      // Simulate browser redirect to callback
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = nowInSeconds + 3600;
      const params = new URLSearchParams({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: String(expiresAtSeconds),
        user_id: 'test-user-id',
        supabase_url: 'https://xyz.supabase.co',
        anon_key: 'test-anon-key',
      });

      const response = await fetch(`http://localhost:${port}/callback?${params}`);
      expect(response.ok).toBe(true);

      const result = await callbackPromise;
      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(result.expiresAt).toBe(expiresAtSeconds * 1000); // Verify conversion to milliseconds
      expect(result.userId).toBe('test-user-id');
      expect(result.supabaseUrl).toBe('https://xyz.supabase.co');
      expect(result.anonKey).toBe('test-anon-key');
    });

    it('rejects on timeout', async () => {
      server = new DeviceAuthServer();
      await server.start(CLOUD_URL);

      await expect(server.waitForCallback(100)).rejects.toThrow('timed out');
    });

    it('returns 400 when missing required parameters', async () => {
      server = new DeviceAuthServer();
      const { port } = await server.start(CLOUD_URL);

      const callbackPromise = server.waitForCallback(5000);

      // Missing access_token
      const params = new URLSearchParams({
        refresh_token: 'test',
        expires_at: '3600',
        user_id: 'test-user',
        supabase_url: 'https://xyz.supabase.co',
        anon_key: 'test-anon-key',
      });

      const [response] = await Promise.all([
        fetch(`http://localhost:${port}/callback?${params}`),
        expect(callbackPromise).rejects.toThrow('Missing callback parameters'),
      ]);

      expect(response.status).toBe(400);
    });
  });

  describe('close', () => {
    it('closes the server without error', async () => {
      server = new DeviceAuthServer();
      await server.start(CLOUD_URL);
      await server.close();
      server = null; // prevent double-close in afterEach
    });
  });

  describe('expires_at validation', () => {
    it('should return 400 for invalid expires_at', async () => {
      server = new DeviceAuthServer();
      const { port } = await server.start(CLOUD_URL);

      const response = await fetch(
        `http://localhost:${port}/callback?access_token=test&refresh_token=test&expires_at=abc&user_id=test&supabase_url=https://test.supabase.co&anon_key=test`
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('Invalid expires_at');
    });

    it('should return 400 for negative expires_at', async () => {
      server = new DeviceAuthServer();
      const { port } = await server.start(CLOUD_URL);

      const response = await fetch(
        `http://localhost:${port}/callback?access_token=test&refresh_token=test&expires_at=-1&user_id=test&supabase_url=https://test.supabase.co&anon_key=test`
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('Invalid expires_at');
    });

    it('should return 400 for zero expires_at', async () => {
      server = new DeviceAuthServer();
      const { port } = await server.start(CLOUD_URL);

      const response = await fetch(
        `http://localhost:${port}/callback?access_token=test&refresh_token=test&expires_at=0&user_id=test&supabase_url=https://test.supabase.co&anon_key=test`
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('Invalid expires_at');
    });
  });
});
