import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigManager, type VibePilotConfig } from '../../src/config/ConfigManager.js';

describe('ConfigManager', () => {
  let tmpDir: string;
  let manager: ConfigManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibepilot-config-test-'));
    manager = new ConfigManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('getDefault() returns valid config with auth mode "none"', () => {
    const config = manager.getDefault();

    expect(config.version).toBe('0.1.0');
    expect(config.auth.mode).toBe('none');
    expect(config.server.port).toBe(9800);
    expect(config.server.sessionTimeout).toBe(300);
    expect(config.server.agentName).toBe(os.hostname());
    expect(config.projects).toEqual([]);
  });

  it('exists() returns false when no file', async () => {
    const result = await manager.exists();
    expect(result).toBe(false);
  });

  it('save() creates directory and writes file', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'config');
    const nestedManager = new ConfigManager(nestedDir);
    const config = nestedManager.getDefault();

    await nestedManager.save(config);

    const filePath = path.join(nestedDir, 'config.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('0.1.0');
  });

  it('exists() returns true after save', async () => {
    const config = manager.getDefault();
    await manager.save(config);

    const result = await manager.exists();
    expect(result).toBe(true);
  });

  it('load() returns saved config', async () => {
    const config = manager.getDefault();
    config.auth.mode = 'token';
    config.token = 'my-secret-token';
    config.projects = [
      {
        id: 'proj-1',
        name: 'TestProject',
        path: '/home/user/test',
        favorite: true,
        createdAt: Date.now(),
      },
    ];

    await manager.save(config);
    const loaded = await manager.load();

    expect(loaded.auth.mode).toBe('token');
    expect(loaded.token).toBe('my-secret-token');
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].name).toBe('TestProject');
  });

  it('load() returns defaults when file does not exist', async () => {
    const loaded = await manager.load();

    expect(loaded.version).toBe('0.1.0');
    expect(loaded.auth.mode).toBe('none');
    expect(loaded.server.port).toBe(9800);
    expect(loaded.projects).toEqual([]);
  });

  it('load() returns defaults when JSON is corrupted', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.writeFile(configPath, 'this is not valid json!!!', 'utf-8');

    const loaded = await manager.load();

    expect(loaded.version).toBe('0.1.0');
    expect(loaded.auth.mode).toBe('none');
    expect(loaded.server.port).toBe(9800);
    expect(loaded.projects).toEqual([]);
  });

  it('reset() deletes config file', async () => {
    const config = manager.getDefault();
    await manager.save(config);
    expect(await manager.exists()).toBe(true);

    await manager.reset();
    expect(await manager.exists()).toBe(false);
  });
});
