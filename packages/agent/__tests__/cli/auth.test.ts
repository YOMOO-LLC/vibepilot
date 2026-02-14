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

const { mockCredManager, mockDeviceServer, mockConfigManager } = vi.hoisted(() => {
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
  const mockConfigManager = {
    load: vi.fn(),
    save: vi.fn(),
    exists: vi.fn(),
    getDefault: vi.fn(),
  };
  return { mockCredManager, mockDeviceServer, mockConfigManager };
});

const { MockCredentialManagerClass, MockDeviceAuthServerClass, MockConfigManagerClass } =
  vi.hoisted(() => {
    const MockCredentialManagerClass = vi.fn();
    MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
    const MockDeviceAuthServerClass = vi.fn();
    const MockConfigManagerClass = vi.fn();
    return { MockCredentialManagerClass, MockDeviceAuthServerClass, MockConfigManagerClass };
  });

vi.mock('../../src/auth/CredentialManager.js', () => ({
  CredentialManager: MockCredentialManagerClass,
}));

vi.mock('../../src/auth/DeviceAuthServer.js', () => ({
  DeviceAuthServer: MockDeviceAuthServerClass,
}));

vi.mock('../../src/config/ConfigManager.js', () => ({
  ConfigManager: MockConfigManagerClass,
}));

vi.mock('jose', () => ({
  decodeJwt: vi.fn().mockReturnValue({ sub: 'uuid-user-123' }),
}));

vi.mock('../../src/cli/setupWizard.js', () => ({
  runSetupWizard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/cli/configCommand.js', () => ({
  configMain: vi.fn().mockResolvedValue(undefined),
  configAuth: vi.fn().mockResolvedValue(undefined),
  configServer: vi.fn().mockResolvedValue(undefined),
  configProjects: vi.fn().mockResolvedValue(undefined),
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
    MockConfigManagerClass.mockImplementation(() => mockConfigManager);

    // Default config: cloud mode with webUrl configured
    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'none' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test' },
      projects: [],
    });

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('auth commands (colon-style)', () => {
    it('has auth:login, auth:logout, auth:status commands', () => {
      const loginCmd = program.commands.find((c) => c.name() === 'auth:login');
      const logoutCmd = program.commands.find((c) => c.name() === 'auth:logout');
      const statusCmd = program.commands.find((c) => c.name() === 'auth:status');

      expect(loginCmd).toBeDefined();
      expect(logoutCmd).toBeDefined();
      expect(statusCmd).toBeDefined();
    });
  });

  describe('auth:login', () => {
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
        expiresAt: Date.now() + 3600 * 1000,
        userId: 'test-user-id',
        supabaseUrl: 'https://xyz.supabase.co',
        anonKey: 'test-anon',
      });
      mockDeviceServer.close.mockResolvedValue(undefined);
      mockCredManager.save.mockResolvedValue(undefined);

      await program.parseAsync(['node', 'vibepilot', 'auth:login']);

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

      await program.parseAsync(['node', 'vibepilot', 'auth:login']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Already logged in'));
      expect(mockDeviceServer.start).not.toHaveBeenCalled();
    });
  });

  describe('auth:logout', () => {
    it('clears credentials and prints success', async () => {
      mockCredManager.load.mockResolvedValue({ email: 'user@example.com' });
      mockCredManager.clear.mockResolvedValue(undefined);

      await program.parseAsync(['node', 'vibepilot', 'auth:logout']);

      expect(mockCredManager.clear).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Logged out'));
    });

    it('prints message when not logged in', async () => {
      mockCredManager.load.mockResolvedValue(null);

      await program.parseAsync(['node', 'vibepilot', 'auth:logout']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });
  });

  describe('auth:status', () => {
    it('shows user info when logged in', async () => {
      mockCredManager.load.mockResolvedValue({
        email: 'user@example.com',
        userId: 'uuid-123',
        expiresAt: Date.now() + 3600_000,
        supabaseUrl: 'https://xyz.supabase.co',
      });

      await program.parseAsync(['node', 'vibepilot', 'auth:status']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user@example.com'));
    });

    it('shows not logged in when no credentials', async () => {
      mockCredManager.load.mockResolvedValue(null);

      await program.parseAsync(['node', 'vibepilot', 'auth:status']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });
  });
});
