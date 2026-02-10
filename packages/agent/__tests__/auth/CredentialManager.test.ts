import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock jose for extractUserId
const { mockDecodeJwt } = vi.hoisted(() => ({
  mockDecodeJwt: vi.fn(),
}));

vi.mock('jose', () => ({
  decodeJwt: mockDecodeJwt,
}));

import { CredentialManager, type Credentials } from '../../src/auth/CredentialManager';

const TEST_CREDENTIALS: Credentials = {
  version: '0.1.0',
  supabaseUrl: 'https://xyz.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access',
  refreshToken: 'refresh-token-abc',
  expiresAt: Date.now() + 3600_000, // 1 hour from now
  userId: 'uuid-abc-123',
  email: 'user@example.com',
  createdAt: Date.now(),
};

describe('CredentialManager', () => {
  let tempDir: string;
  let manager: CredentialManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-cred-test-'));
    manager = new CredentialManager(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('returns null when file does not exist', async () => {
      const creds = await manager.load();
      expect(creds).toBeNull();
    });

    it('returns Credentials when file has valid JSON', async () => {
      await fs.writeFile(
        path.join(tempDir, 'credentials.json'),
        JSON.stringify(TEST_CREDENTIALS),
        'utf-8'
      );

      const creds = await manager.load();
      expect(creds).toEqual(TEST_CREDENTIALS);
    });

    it('returns null when file has invalid JSON', async () => {
      await fs.writeFile(path.join(tempDir, 'credentials.json'), 'not json!!!', 'utf-8');

      const creds = await manager.load();
      expect(creds).toBeNull();
    });

    it('returns null when file is missing required fields', async () => {
      await fs.writeFile(
        path.join(tempDir, 'credentials.json'),
        JSON.stringify({ version: '0.1.0' }),
        'utf-8'
      );

      const creds = await manager.load();
      expect(creds).toBeNull();
    });
  });

  describe('save', () => {
    it('writes credentials and sets 0o600 permissions', async () => {
      await manager.save(TEST_CREDENTIALS);

      const filePath = path.join(tempDir, 'credentials.json');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(TEST_CREDENTIALS);

      const stats = await fs.stat(filePath);
      // 0o600 = owner read/write only (0o100600 on file)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('creates config directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'dir');
      const nestedManager = new CredentialManager(nestedDir);

      await nestedManager.save(TEST_CREDENTIALS);

      const content = await fs.readFile(path.join(nestedDir, 'credentials.json'), 'utf-8');
      expect(JSON.parse(content)).toEqual(TEST_CREDENTIALS);
    });
  });

  describe('clear', () => {
    it('deletes credentials file', async () => {
      await manager.save(TEST_CREDENTIALS);
      await manager.clear();

      const creds = await manager.load();
      expect(creds).toBeNull();
    });

    it('does not throw when file does not exist', async () => {
      await expect(manager.clear()).resolves.not.toThrow();
    });
  });

  describe('refreshIfNeeded', () => {
    it('returns credentials unchanged when not expiring soon', async () => {
      const creds = { ...TEST_CREDENTIALS, expiresAt: Date.now() + 600_000 }; // 10 min left
      const result = await manager.refreshIfNeeded(creds);
      expect(result).toEqual(creds);
    });

    it('calls refresh API when token expires within 5 minutes', async () => {
      const creds = {
        ...TEST_CREDENTIALS,
        expiresAt: Date.now() + 120_000, // 2 min left — needs refresh
      };

      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_in: 3600,
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      const result = await manager.refreshIfNeeded(creds);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${creds.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: creds.anonKey,
          },
          body: JSON.stringify({ refresh_token: creds.refreshToken }),
        }
      );
      expect(result.accessToken).toBe(newAccessToken);
      expect(result.refreshToken).toBe(newRefreshToken);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('throws when refresh API fails', async () => {
      const creds = {
        ...TEST_CREDENTIALS,
        expiresAt: Date.now() + 60_000, // 1 min left
      };

      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('invalid refresh token'),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

      await expect(manager.refreshIfNeeded(creds)).rejects.toThrow('Token refresh failed');
    });
  });

  describe('extractUserId', () => {
    it('returns sub claim from valid JWT', () => {
      mockDecodeJwt.mockReturnValue({ sub: 'uuid-abc-123' });

      const userId = CredentialManager.extractUserId('some.jwt.token');
      expect(userId).toBe('uuid-abc-123');
      expect(mockDecodeJwt).toHaveBeenCalledWith('some.jwt.token');
    });

    it('throws when JWT has no sub claim', () => {
      mockDecodeJwt.mockReturnValue({ aud: 'authenticated' });

      expect(() => CredentialManager.extractUserId('no.sub.token')).toThrow(
        'JWT missing sub claim'
      );
    });
  });
});
