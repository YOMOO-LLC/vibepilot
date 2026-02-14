import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ConfigManager } from '../../src/config/ConfigManager.js';

// ── Hoisted mock factories ─────────────────────────────────────
const {
  mockOpen,
  mockDeviceServer,
  mockCredManager,
  MockCredentialManagerClass,
  MockDeviceAuthServerClass,
} = vi.hoisted(() => {
  const mockOpen = vi.fn().mockResolvedValue(undefined);
  const mockDeviceServer = {
    start: vi.fn(),
    waitForCallback: vi.fn(),
    close: vi.fn(),
  };
  const mockCredManager = {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
    refreshIfNeeded: vi.fn(),
  };
  const MockCredentialManagerClass = vi.fn();
  MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
  const MockDeviceAuthServerClass = vi.fn();
  return {
    mockOpen,
    mockDeviceServer,
    mockCredManager,
    MockCredentialManagerClass,
    MockDeviceAuthServerClass,
  };
});

// Mock @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

// Mock open (dynamic import)
vi.mock('open', () => ({ default: mockOpen }));

// Mock DeviceAuthServer
vi.mock('../../src/auth/DeviceAuthServer.js', () => ({
  DeviceAuthServer: MockDeviceAuthServerClass,
}));

// Mock CredentialManager
vi.mock('../../src/auth/CredentialManager.js', () => ({
  CredentialManager: MockCredentialManagerClass,
}));

// Mock jose (required by CredentialManager)
vi.mock('jose', () => ({
  decodeJwt: vi.fn().mockReturnValue({ sub: 'uuid-user-123' }),
}));

import { select, input } from '@inquirer/prompts';
import { runSetupWizard } from '../../src/cli/setupWizard.js';

const mockedSelect = vi.mocked(select);
const mockedInput = vi.mocked(input);

describe('runSetupWizard', () => {
  let tmpDir: string;
  let configManager: ConfigManager;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-wire constructor mocks after clearAllMocks
    MockCredentialManagerClass.mockImplementation(() => mockCredManager);
    MockCredentialManagerClass.extractUserId = vi.fn().mockReturnValue('uuid-user-123');
    MockDeviceAuthServerClass.mockImplementation(() => mockDeviceServer);

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-setup-wizard-'));
    configManager = new ConfigManager(tmpDir);

    // Default: stub fetch
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ supabaseUrl: 'https://xyz.supabase.co', anonKey: 'test-anon-key' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('cloud mode: fetches config, runs auth, saves config and credentials', async () => {
    // Step 1: select auth mode → cloud
    mockedSelect.mockResolvedValueOnce('cloud');

    // Step 2: device auth server start
    mockDeviceServer.start.mockResolvedValue({
      port: 19850,
      state: 'test-state',
      authUrl: 'https://vibepilot.cloud/auth/device?port=19850&state=test-state',
    });

    // Step 3: device auth callback
    mockDeviceServer.waitForCallback.mockResolvedValue({
      accessToken: 'cloud-access-token',
      refreshToken: 'cloud-refresh-token',
      expiresAt: Date.now() + 3600 * 1000,
      userId: 'test-user-id',
      supabaseUrl: 'https://xyz.supabase.co',
      anonKey: 'test-anon-key',
    });
    mockDeviceServer.close.mockResolvedValue(undefined);
    mockCredManager.save.mockResolvedValue(undefined);

    // Step 4: project prompt → skip
    mockedSelect.mockResolvedValueOnce('skip');

    await runSetupWizard(configManager, { openBrowser: false });

    // Verify fetch was called to get cloud config
    expect(fetchSpy).toHaveBeenCalledWith('https://vibepilot.cloud/api/config');

    // Verify device auth server was started
    expect(mockDeviceServer.start).toHaveBeenCalledWith('https://vibepilot.cloud');

    // Verify credentials were saved
    expect(mockCredManager.save).toHaveBeenCalled();

    // Verify config was saved with cloud mode
    const config = await configManager.load();
    expect(config.auth.mode).toBe('cloud');
    expect(config.cloud).toBeDefined();
    expect(config.cloud!.webUrl).toBe('https://vibepilot.cloud');
  });

  it('self-hosted mode: prompts for connection details, saves config', async () => {
    // Step 1: select auth mode → self-hosted
    mockedSelect.mockResolvedValueOnce('self-hosted');

    // Step 2: prompts for webUrl, supabaseUrl, anonKey
    mockedInput
      .mockResolvedValueOnce('https://my-instance.example.com')
      .mockResolvedValueOnce('https://my-supabase.supabase.co')
      .mockResolvedValueOnce('my-anon-key-123');

    // Step 3: device auth server
    mockDeviceServer.start.mockResolvedValue({
      port: 19851,
      state: 'test-state-2',
      authUrl: 'https://my-instance.example.com/auth/device?port=19851&state=test-state-2',
    });
    mockDeviceServer.waitForCallback.mockResolvedValue({
      accessToken: 'sh-access-token',
      refreshToken: 'sh-refresh-token',
      expiresAt: Date.now() + 3600 * 1000,
      userId: 'test-user-id-2',
      supabaseUrl: 'https://my-supabase.supabase.co',
      anonKey: 'my-anon-key-123',
    });
    mockDeviceServer.close.mockResolvedValue(undefined);
    mockCredManager.save.mockResolvedValue(undefined);

    // Step 4: project prompt → skip
    mockedSelect.mockResolvedValueOnce('skip');

    await runSetupWizard(configManager, { openBrowser: false });

    // Verify device auth was started with user's webUrl
    expect(mockDeviceServer.start).toHaveBeenCalledWith('https://my-instance.example.com');

    // Verify credentials were saved
    expect(mockCredManager.save).toHaveBeenCalled();

    // Verify config
    const config = await configManager.load();
    expect(config.auth.mode).toBe('self-hosted');
    expect(config.selfHosted).toBeDefined();
    expect(config.selfHosted!.webUrl).toBe('https://my-instance.example.com');
    expect(config.selfHosted!.supabaseUrl).toBe('https://my-supabase.supabase.co');
    expect(config.selfHosted!.anonKey).toBe('my-anon-key-123');
  });

  it('token mode: prompts for token, saves config', async () => {
    // Step 1: select auth mode → token
    mockedSelect.mockResolvedValueOnce('token');

    // Step 2: prompt for token string
    mockedInput.mockResolvedValueOnce('my-secret-token-xyz');

    // Step 3: project prompt → skip
    mockedSelect.mockResolvedValueOnce('skip');

    await runSetupWizard(configManager, { openBrowser: false });

    // Should not call fetch or device auth
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockDeviceServer.start).not.toHaveBeenCalled();

    // Verify config
    const config = await configManager.load();
    expect(config.auth.mode).toBe('token');
    expect(config.token).toBe('my-secret-token-xyz');
  });

  it('none mode: saves config with no auth', async () => {
    // Step 1: select auth mode → none
    mockedSelect.mockResolvedValueOnce('none');

    // Step 2: project prompt → skip
    mockedSelect.mockResolvedValueOnce('skip');

    await runSetupWizard(configManager, { openBrowser: false });

    // Should not call fetch or device auth
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockDeviceServer.start).not.toHaveBeenCalled();

    // Verify config
    const config = await configManager.load();
    expect(config.auth.mode).toBe('none');
    expect(config.cloud).toBeUndefined();
    expect(config.selfHosted).toBeUndefined();
    expect(config.token).toBeUndefined();
  });

  it('adds current directory as project when selected', async () => {
    // Step 1: select auth mode → none (skip auth complexity)
    mockedSelect.mockResolvedValueOnce('none');

    // Step 2: project prompt → add current directory
    mockedSelect.mockResolvedValueOnce('cwd');

    // Step 3: prompt for project name
    mockedInput.mockResolvedValueOnce('my-project');

    await runSetupWizard(configManager, { openBrowser: false });

    // Verify config has 1 project with correct path
    const config = await configManager.load();
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe('my-project');
    expect(config.projects[0].path).toBe(process.cwd());
    expect(config.projects[0].id).toBeTruthy();
    expect(config.projects[0].favorite).toBe(false);
  });
});
