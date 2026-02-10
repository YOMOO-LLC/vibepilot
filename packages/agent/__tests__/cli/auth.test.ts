import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all heavy dependencies to avoid starting real servers
vi.mock('../../src/transport/WebSocketServer.js', () => ({
  VPWebSocketServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('node-pty', () => ({
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));

const { mockOpen } = vi.hoisted(() => ({
  mockOpen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('open', () => ({ default: mockOpen }));

const { mockCredManager, mockDeviceServer } = vi.hoisted(() => {
  const mockCredManager = {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
    refreshIfNeeded: vi.fn(),
  };
  const mockDeviceServer = {
    start: vi.fn(),
    waitForCallback: vi.fn(),
    close: vi.fn(),
  };
  return { mockCredManager, mockDeviceServer };
});

const { MockCredentialManagerClass, MockDeviceAuthServerClass } = vi.hoisted(() => {
  const MockCredentialManagerClass = vi.fn();
  MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
  const MockDeviceAuthServerClass = vi.fn();
  return { MockCredentialManagerClass, MockDeviceAuthServerClass };
});

vi.mock('../../src/auth/CredentialManager.js', () => ({
  CredentialManager: MockCredentialManagerClass,
}));

vi.mock('../../src/auth/DeviceAuthServer.js', () => ({
  DeviceAuthServer: MockDeviceAuthServerClass,
}));

vi.mock('jose', () => ({
  decodeJwt: vi.fn().mockReturnValue({ sub: 'uuid-user-123' }),
}));

import { program } from '../../bin/vibepilot.js';

describe('CLI auth commands', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire constructor mocks after clearAllMocks
    MockCredentialManagerClass.mockImplementation(() => mockCredManager);
    MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
    MockDeviceAuthServerClass.mockImplementation(() => mockDeviceServer);

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('auth command group', () => {
    it('has auth command with login, logout, status subcommands', () => {
      const authCmd = program.commands.find((c) => c.name() === 'auth');
      expect(authCmd).toBeDefined();

      const subcommands = authCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('login');
      expect(subcommands).toContain('logout');
      expect(subcommands).toContain('status');
    });
  });

  describe('auth login', () => {
    it('starts device auth server and opens browser', async () => {
      mockCredManager.load.mockResolvedValue(null);
      mockDeviceServer.start.mockResolvedValue({
        port: 19850,
        state: 'test-state',
        authUrl: 'https://vibepilot.dev/auth/device?port=19850&state=test-state',
      });
      mockDeviceServer.waitForCallback.mockResolvedValue({
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        expiresIn: 3600,
        supabaseUrl: 'https://xyz.supabase.co',
        anonKey: 'test-anon',
      });
      mockDeviceServer.close.mockResolvedValue(undefined);
      mockCredManager.save.mockResolvedValue(undefined);

      await program.parseAsync(['node', 'vibepilot', 'auth', 'login']);

      expect(mockDeviceServer.start).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalledWith(
        'https://vibepilot.dev/auth/device?port=19850&state=test-state'
      );
      expect(mockCredManager.save).toHaveBeenCalled();
    });

    it('shows already logged in message when credentials exist', async () => {
      mockCredManager.load.mockResolvedValue({
        version: '0.1.0',
        email: 'user@example.com',
        userId: 'uuid-123',
      });

      await program.parseAsync(['node', 'vibepilot', 'auth', 'login']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Already logged in'));
      expect(mockDeviceServer.start).not.toHaveBeenCalled();
    });
  });

  describe('auth logout', () => {
    it('clears credentials and prints success', async () => {
      mockCredManager.load.mockResolvedValue({ email: 'user@example.com' });
      mockCredManager.clear.mockResolvedValue(undefined);

      await program.parseAsync(['node', 'vibepilot', 'auth', 'logout']);

      expect(mockCredManager.clear).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Logged out'));
    });

    it('prints message when not logged in', async () => {
      mockCredManager.load.mockResolvedValue(null);

      await program.parseAsync(['node', 'vibepilot', 'auth', 'logout']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });
  });

  describe('auth status', () => {
    it('shows user info when logged in', async () => {
      mockCredManager.load.mockResolvedValue({
        email: 'user@example.com',
        userId: 'uuid-123',
        expiresAt: Date.now() + 3600_000,
        supabaseUrl: 'https://xyz.supabase.co',
      });

      await program.parseAsync(['node', 'vibepilot', 'auth', 'status']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user@example.com'));
    });

    it('shows not logged in when no credentials', async () => {
      mockCredManager.load.mockResolvedValue(null);

      await program.parseAsync(['node', 'vibepilot', 'auth', 'status']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });
  });
});
