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
    it('binds to a port and returns authUrl with port and state', async () => {
      server = new DeviceAuthServer();
      const result = await server.start(CLOUD_URL);

      expect(result.port).toBeGreaterThanOrEqual(19800);
      expect(result.port).toBeLessThanOrEqual(19899);
      expect(result.state).toBeTruthy();
      expect(result.state.length).toBeGreaterThan(20); // base64url of 32 bytes

      const url = new URL(result.authUrl);
      expect(url.origin).toBe(CLOUD_URL);
      expect(url.pathname).toBe('/auth/device');
      expect(url.searchParams.get('port')).toBe(String(result.port));
      expect(url.searchParams.get('state')).toBe(result.state);
    });
  });

  describe('waitForCallback', () => {
    it('resolves with tokens when receiving a valid callback', async () => {
      server = new DeviceAuthServer();
      const { port, state } = await server.start(CLOUD_URL);

      const callbackPromise = server.waitForCallback(5000);

      // Simulate browser redirect to callback
      const params = new URLSearchParams({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: '3600',
        state,
        supabase_url: 'https://xyz.supabase.co',
        anon_key: 'test-anon-key',
      });

      const response = await fetch(`http://localhost:${port}/callback?${params}`);
      expect(response.ok).toBe(true);

      const result = await callbackPromise;
      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(result.expiresIn).toBe(3600);
      expect(result.supabaseUrl).toBe('https://xyz.supabase.co');
      expect(result.anonKey).toBe('test-anon-key');
    });

    it('rejects when state does not match', async () => {
      server = new DeviceAuthServer();
      const { port } = await server.start(CLOUD_URL);

      const callbackPromise = server.waitForCallback(5000);

      const params = new URLSearchParams({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: '3600',
        state: 'wrong-state',
        supabase_url: 'https://xyz.supabase.co',
        anon_key: 'test-anon-key',
      });

      // Send the request and check both the HTTP response and the promise rejection.
      // The promise rejects as a side-effect of the HTTP handler, so we await both.
      const [response] = await Promise.all([
        fetch(`http://localhost:${port}/callback?${params}`),
        expect(callbackPromise).rejects.toThrow('state mismatch'),
      ]);

      expect(response.status).toBe(400);
    });

    it('rejects on timeout', async () => {
      server = new DeviceAuthServer();
      await server.start(CLOUD_URL);

      await expect(server.waitForCallback(100)).rejects.toThrow('timed out');
    });

    it('returns 400 when missing required parameters', async () => {
      server = new DeviceAuthServer();
      const { port, state } = await server.start(CLOUD_URL);

      const callbackPromise = server.waitForCallback(5000);

      // Missing access_token
      const params = new URLSearchParams({
        state,
        refresh_token: 'test',
        expires_in: '3600',
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
});
