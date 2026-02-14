import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock factories ─────────────────────────────────────
const {
  MockWSServer,
  mockCredManager,
  MockCredentialManagerClass,
  MockSupabaseUserRegistryClass,
  MockSupabaseRegistryClass,
  mockSupabaseUserRegister,
  mockSupabaseRegister,
  mockConfigManager,
  MockConfigManagerClass,
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
  const mockSupabaseRegister = vi.fn();
  const MockSupabaseRegistryClass = vi.fn();
  const mockConfigManager = {
    load: vi.fn(),
    save: vi.fn(),
    exists: vi.fn(),
    getDefault: vi.fn(),
  };
  const MockConfigManagerClass = vi.fn();
  return {
    MockWSServer,
    mockCredManager,
    MockCredentialManagerClass,
    MockSupabaseUserRegistryClass,
    MockSupabaseRegistryClass,
    mockSupabaseUserRegister,
    mockSupabaseRegister,
    mockConfigManager,
    MockConfigManagerClass,
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
  DeviceAuthServer: vi.fn(),
}));

vi.mock('../../src/registry/SupabaseUserRegistry.js', () => ({
  SupabaseUserRegistry: MockSupabaseUserRegistryClass,
}));

vi.mock('../../src/registry/SupabaseRegistry.js', () => ({
  SupabaseRegistry: MockSupabaseRegistryClass,
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
  })),
}));

import { program } from '../../bin/vibepilot.js';

describe('serve with stored credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire all constructor mocks
    MockWSServer.mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }));
    MockCredentialManagerClass.mockImplementation(() => mockCredManager);
    MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
    MockConfigManagerClass.mockImplementation(() => mockConfigManager);

    // Default: config file exists, auth mode 'none'
    mockConfigManager.exists.mockResolvedValue(true);
    mockConfigManager.load.mockResolvedValue({
      version: '0.1.0',
      auth: { mode: 'none' },
      server: { port: 9800, sessionTimeout: 300, agentName: 'test-host' },
      projects: [],
    });

    MockSupabaseUserRegistryClass.mockImplementation(() => ({
      register: mockSupabaseUserRegister.mockResolvedValue({
        id: 'agent-001',
        name: 'test-agent',
        publicUrl: 'wss://localhost:9800',
        ownerId: 'uuid-user-123',
        status: 'online',
        lastSeen: Date.now(),
      }),
      heartbeat: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(undefined),
    }));
    MockSupabaseRegistryClass.mockImplementation(() => ({
      register: mockSupabaseRegister.mockResolvedValue({
        id: 'agent-002',
        name: 'test-agent',
        publicUrl: 'wss://localhost:9800',
        ownerId: 'explicit-owner',
        status: 'online',
        lastSeen: Date.now(),
      }),
      heartbeat: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(undefined),
    }));

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses SupabaseUserRegistry when credentials file exists and no explicit flags', async () => {
    const testCreds = {
      version: '0.1.0',
      supabaseUrl: 'https://xyz.supabase.co',
      anonKey: 'test-anon-key',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600_000,
      userId: 'uuid-user-123',
      email: 'user@example.com',
      createdAt: Date.now(),
    };
    mockCredManager.load.mockResolvedValue(testCreds);
    mockCredManager.refreshIfNeeded.mockResolvedValue(testCreds);

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19900']);

    expect(mockCredManager.load).toHaveBeenCalled();
    expect(mockCredManager.refreshIfNeeded).toHaveBeenCalledWith(testCreds);
    expect(MockSupabaseUserRegistryClass).toHaveBeenCalledWith(
      'https://xyz.supabase.co',
      'test-anon-key',
      'test-access-token'
    );
  });

  it('does not use credentials when no file exists', async () => {
    mockCredManager.load.mockResolvedValue(null);

    await program.parseAsync(['node', 'vibepilot', 'serve', '--port', '19901']);

    expect(mockCredManager.load).toHaveBeenCalled();
    expect(MockSupabaseUserRegistryClass).not.toHaveBeenCalled();
  });

  it('explicit flags override credentials file', async () => {
    mockCredManager.load.mockResolvedValue({
      version: '0.1.0',
      supabaseUrl: 'https://xyz.supabase.co',
      anonKey: 'test-anon-key',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600_000,
      userId: 'uuid-user-123',
      email: 'user@example.com',
      createdAt: Date.now(),
    });

    // When explicit --supabase-url and --supabase-key are provided, use SupabaseRegistry path
    await program.parseAsync([
      'node',
      'vibepilot',
      'serve',
      '--port',
      '19902',
      '--supabase-url',
      'https://explicit.supabase.co',
      '--supabase-key',
      'explicit-service-key',
      '--owner-id',
      'explicit-owner',
    ]);

    // SupabaseUserRegistry should NOT be used since explicit flags take priority
    expect(MockSupabaseUserRegistryClass).not.toHaveBeenCalled();
    expect(MockSupabaseRegistryClass).toHaveBeenCalledWith(
      'https://explicit.supabase.co',
      'explicit-service-key'
    );
  });
});
