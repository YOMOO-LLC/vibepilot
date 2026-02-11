import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ConfigManager } from '../../src/config/ConfigManager.js';

// Mock @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

import { select, input } from '@inquirer/prompts';
import { configAuth, configServer, configProjects } from '../../src/cli/configCommand.js';

const mockedSelect = vi.mocked(select);
const mockedInput = vi.mocked(input);

describe('configCommand', () => {
  let tmpDir: string;
  let configManager: ConfigManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Suppress console.log output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-config-cmd-'));
    configManager = new ConfigManager(tmpDir);
  });

  it('configAuth() saves cloud mode config', async () => {
    // Mock: user selects "cloud", then enters webUrl
    mockedSelect.mockResolvedValueOnce('cloud');
    mockedInput.mockResolvedValueOnce('https://vibepilot.cloud');

    await configAuth(configManager);

    const config = await configManager.load();
    expect(config.auth.mode).toBe('cloud');
    expect(config.cloud).toBeDefined();
    expect(config.cloud!.webUrl).toBe('https://vibepilot.cloud');
  });

  it('configAuth() saves token mode config', async () => {
    // Mock: user selects "token", then enters the token string
    mockedSelect.mockResolvedValueOnce('token');
    mockedInput.mockResolvedValueOnce('my-secret-token-123');

    await configAuth(configManager);

    const config = await configManager.load();
    expect(config.auth.mode).toBe('token');
    expect(config.token).toBe('my-secret-token-123');
  });

  it('configServer() saves server settings', async () => {
    // Mock: user enters port, sessionTimeout, agentName
    mockedInput
      .mockResolvedValueOnce('8080')
      .mockResolvedValueOnce('600')
      .mockResolvedValueOnce('my-agent');

    await configServer(configManager);

    const config = await configManager.load();
    expect(config.server.port).toBe(8080);
    expect(config.server.sessionTimeout).toBe(600);
    expect(config.server.agentName).toBe('my-agent');
  });

  it('configProjects() adds a new project', async () => {
    // Mock: user selects "add", then enters path and name, then "back"
    mockedSelect.mockResolvedValueOnce('add').mockResolvedValueOnce('back');
    mockedInput.mockResolvedValueOnce('/home/user/my-project').mockResolvedValueOnce('my-project');

    await configProjects(configManager);

    const config = await configManager.load();
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe('my-project');
    expect(config.projects[0].path).toBe('/home/user/my-project');
    expect(config.projects[0].id).toBeTruthy();
  });
});
