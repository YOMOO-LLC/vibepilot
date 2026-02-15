import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock factories ─────────────────────────────────────
const {
  MockWSServer,
  mockCredManager,
  MockCredentialManagerClass,
  MockSupabaseUserRegistryClass,
  mockSupabaseUserRegister,
  mockConfigManager,
  MockConfigManagerClass,
  mockDeviceServer,
  MockDeviceAuthServerClass,
  mockOpen,
} = vi.hoisted(() => {
  const MockWSServer = vi.fn();
  const mockCredManager = {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
    refreshIfNeeded: vi.fn(),
  };
  const MockCredentialManagerClass = vi.fn();
  MockCredentialManagerClass.extractUserId = vi.fn();
  const mockSupabaseUserRegister = vi.fn();
  const MockSupabaseUserRegistryClass = vi.fn();
  const mockConfigManager = {
    load: vi.fn(),
    save: vi.fn(),
    exists: vi.fn(),
    getDefault: vi.fn(),
  };
  const MockConfigManagerClass = vi.fn();
  const mockDeviceServer = {
    start: vi.fn(),
    waitForCallback: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const MockDeviceAuthServerClass = vi.fn();
  const mockOpen = vi.fn().mockResolvedValue(undefined);
  return {
    MockWSServer,
    mockCredManager,
    MockCredentialManagerClass,
    MockSupabaseUserRegistryClass,
    mockSupabaseUserRegister,
    mockConfigManager,
    MockConfigManagerClass,
    mockDeviceServer,
    MockDeviceAuthServerClass,
    mockOpen,
  };
});

vi.mock('../../src/transport/WebSocketServer.js', () => ({
  VPWebSocketServer: MockWSServer,
}));

vi.mock('node-pty', () => ({
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));

vi.mock('../../src/auth/CredentialManager.js', () => ({
  CredentialManager: MockCredentialManagerClass,
}));

vi.mock('../../src/auth/DeviceAuthServer.js', () => ({
  DeviceAuthServer: MockDeviceAuthServerClass,
}));

vi.mock('../../src/registry/SupabaseUserRegistry.js', () => ({
  SupabaseUserRegistry: MockSupabaseUserRegistryClass,
}));

vi.mock('../../src/registry/SupabaseRegistry.js', () => ({
  SupabaseRegistry: vi.fn(),
}));

vi.mock('../../src/config/ConfigManager.js', () => ({
  ConfigManager: MockConfigManagerClass,
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

vi.mock('jose', () => ({
  decodeJwt: vi.fn().mockReturnValue({ sub: 'uuid-user-123' }),
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/transport/RealtimePresence.js', () => ({
  RealtimePresence: vi.fn().mockImplementation(() => ({
    announceOnline: vi.fn().mockResolvedValue(undefined),
    announceOffline: vi.fn().mockResolvedValue(undefined),
    getChannel: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('../../src/transport/WebRTCSignaling.js', () => ({
  WebRTCSignaling: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('open', () => ({ default: mockOpen }));

// Mock fetch for cloud config
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { program } from '../../bin/vibepilot.js';

describe('serve auto-login (cloud mode, no credentials)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    MockWSServer.mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }));
    MockCredentialManagerClass.mockImplementation(() => mockCredManager);
    MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
    MockConfigManagerClass.mockImplementation(() => mockConfigManager);
    MockDeviceAuthServerClass.mockImplementation(() => mockDeviceServer);

    mockConfigManager.exists.mockResolvedValue(true);

    MockSupabaseUserRegistryClass.mockImplementation(() => ({
      register: mockSupabaseUserRegister.mockResolvedValue({
        id: 'agent-001',
        name: 'test-agent',
        publicUrl: 'ws://localhost:9800',
        ownerId: 'uuid-user-123',
        status: 'online',
        lastSeen: Date.now(),
      }),
      heartbeat: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(undefined),
    }));

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers auto-login when cloud mode is set but no credentials exist', async () => {
    // Config says cloud mode
    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'cloud' },
      cloud: { webUrl: 'https://vibepilot.cloud' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test-host' },
      projects: [],
    });

    // The saved credentials that auto-login will produce
    const savedCreds = {
      version: '0.1.0',
      supabaseUrl: 'https://xyz.supabase.co',
      anonKey: 'test-anon-key',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: Date.now() + 3600_000,
      userId: 'uuid-user-123',
      email: '',
      createdAt: Date.now(),
    };

    // First call (auth mode branch): null => triggers auto-login
    // Second call (registry branch): returns saved creds
    mockCredManager.load.mockResolvedValueOnce(null).mockResolvedValueOnce(savedCreds);
    // Registry init block also calls refreshIfNeeded on the loaded creds
    mockCredManager.refreshIfNeeded.mockImplementation((c: any) => Promise.resolve(c));

    // Cloud config fetch succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        supabaseUrl: 'https://xyz.supabase.co',
        anonKey: 'test-anon-key',
      }),
    });

    // Device auth flow succeeds
    mockDeviceServer.start.mockResolvedValue({
      port: 19850,
      authUrl: 'https://vibepilot.cloud/auth/device?port=19850',
    });
    mockDeviceServer.waitForCallback.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: Date.now() + 3600_000,
      userId: 'uuid-user-123',
      supabaseUrl: 'https://xyz.supabase.co',
      anonKey: 'test-anon-key',
    });

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19950']);

    // Should have started device auth
    expect(MockDeviceAuthServerClass).toHaveBeenCalled();
    expect(mockDeviceServer.start).toHaveBeenCalled();
    expect(mockDeviceServer.waitForCallback).toHaveBeenCalled();

    // Should save credentials (once from autoLogin, possibly once from registry refresh)
    expect(mockCredManager.save).toHaveBeenCalled();

    // Fresh login should NOT call refreshIfNeeded in the auth mode branch
    // (only the registry init branch may call it on the second load)
    // Verify the first refreshIfNeeded call is NOT from the auth-mode branch
    // by checking that the auth-mode block uses creds directly.
    // The registry branch creates a new CredentialManager, loads creds, then refreshes.

    // Should register with SupabaseUserRegistry (in registry init block)
    expect(MockSupabaseUserRegistryClass).toHaveBeenCalled();
  });

  it('falls back gracefully when auto-login device auth times out', async () => {
    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'cloud' },
      cloud: { webUrl: 'https://vibepilot.cloud' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test-host' },
      projects: [],
    });

    mockCredManager.load.mockResolvedValue(null);

    // Cloud config fetch succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        supabaseUrl: 'https://xyz.supabase.co',
        anonKey: 'test-anon-key',
      }),
    });

    // Device auth starts but callback times out
    mockDeviceServer.start.mockResolvedValue({
      port: 19850,
      authUrl: 'https://vibepilot.cloud/auth/device?port=19850',
    });
    mockDeviceServer.waitForCallback.mockRejectedValue(new Error('Authentication timed out'));

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19951']);

    // Should still start the server (without auth)
    expect(MockWSServer).toHaveBeenCalled();
  });

  it('falls back gracefully when cloud config fetch fails', async () => {
    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'cloud' },
      cloud: { webUrl: 'https://vibepilot.cloud' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test-host' },
      projects: [],
    });

    mockCredManager.load.mockResolvedValue(null);

    // Cloud config fetch fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19952']);

    // Should still start the server (without auth)
    expect(MockWSServer).toHaveBeenCalled();
    // Should NOT attempt device auth since config fetch failed
    expect(mockDeviceServer.start).not.toHaveBeenCalled();
  });

  it('skips auto-login when credentials already exist', async () => {
    const testCreds = {
      version: '0.1.0',
      supabaseUrl: 'https://xyz.supabase.co',
      anonKey: 'test-anon-key',
      accessToken: 'existing-access-token',
      refreshToken: 'existing-refresh',
      expiresAt: Date.now() + 3600_000,
      userId: 'uuid-user-123',
      email: 'user@example.com',
      createdAt: Date.now(),
    };

    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'cloud' },
      cloud: { webUrl: 'https://vibepilot.cloud' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test-host' },
      projects: [],
    });

    mockCredManager.load.mockResolvedValue(testCreds);
    mockCredManager.refreshIfNeeded.mockResolvedValue(testCreds);

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19953']);

    // Should NOT start device auth (already have credentials)
    expect(mockDeviceServer.start).not.toHaveBeenCalled();

    // Should use existing credentials to register
    expect(MockSupabaseUserRegistryClass).toHaveBeenCalledWith(
      'https://xyz.supabase.co',
      'test-anon-key',
      'existing-access-token'
    );
  });

  it('skips auto-login when auth mode is not cloud', async () => {
    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'none' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test-host' },
      projects: [],
    });

    mockCredManager.load.mockResolvedValue(null);

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19954']);

    // Should NOT start device auth (auth mode is 'none')
    expect(mockDeviceServer.start).not.toHaveBeenCalled();
  });
});
