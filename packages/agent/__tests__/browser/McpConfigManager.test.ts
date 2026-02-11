import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { McpConfigManager } from '../../src/browser/McpConfigManager.js';

describe('McpConfigManager', () => {
  let tmpDir: string;
  let manager: McpConfigManager;
  const cdpUrl = 'http://127.0.0.1:9222';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    manager = new McpConfigManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes settings.local.json with two managed servers', async () => {
    await manager.write(cdpUrl);

    const raw = await fs.readFile(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8');
    const config = JSON.parse(raw);

    expect(config.mcpServers['vibepilot-playwright']).toBeDefined();
    expect(config.mcpServers['vibepilot-devtools']).toBeDefined();
    expect(config.mcpServers['vibepilot-playwright'].command).toBe('npx');
    expect(config.mcpServers['vibepilot-devtools'].command).toBe('npx');
  });

  it('preserves existing settings when writing', async () => {
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    const existing = { outputStyle: 'Explanatory' };
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(existing),
      'utf-8'
    );

    await manager.write(cdpUrl);

    const raw = await fs.readFile(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8');
    const config = JSON.parse(raw);

    expect(config.outputStyle).toBe('Explanatory');
    expect(config.mcpServers['vibepilot-playwright']).toBeDefined();
    expect(config.mcpServers['vibepilot-devtools']).toBeDefined();
  });

  it('clean() removes only managed servers, preserves other settings', async () => {
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    const existing = { outputStyle: 'Explanatory' };
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(existing),
      'utf-8'
    );

    await manager.write(cdpUrl);
    await manager.clean();

    const raw = await fs.readFile(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8');
    const config = JSON.parse(raw);

    expect(config.outputStyle).toBe('Explanatory');
    expect(config.mcpServers).toBeUndefined();
  });

  it('clean() preserves user-defined MCP servers', async () => {
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    const existing = {
      mcpServers: {
        'my-custom-server': { command: 'node', args: ['server.js'] },
      },
    };
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(existing),
      'utf-8'
    );

    await manager.write(cdpUrl);
    await manager.clean();

    const raw = await fs.readFile(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8');
    const config = JSON.parse(raw);

    expect(config.mcpServers['my-custom-server']).toBeDefined();
    expect(config.mcpServers['vibepilot-playwright']).toBeUndefined();
  });

  it('clean() does not throw when file does not exist', async () => {
    await expect(manager.clean()).resolves.toBeUndefined();
  });

  it('overwrites corrupted JSON', async () => {
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      '{invalid json!!!',
      'utf-8'
    );

    await manager.write(cdpUrl);

    const raw = await fs.readFile(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8');
    const config = JSON.parse(raw);

    expect(config.mcpServers['vibepilot-playwright']).toBeDefined();
  });

  it('passes cdpUrl correctly into server args', async () => {
    const customUrl = 'http://127.0.0.1:9333';
    await manager.write(customUrl);

    const raw = await fs.readFile(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8');
    const config = JSON.parse(raw);

    expect(config.mcpServers['vibepilot-playwright'].args).toContain(customUrl);
    expect(config.mcpServers['vibepilot-devtools'].args).toContain(customUrl);
  });

  it('writes CLAUDE.local.md on write()', async () => {
    await manager.write(cdpUrl);

    const content = await fs.readFile(path.join(tmpDir, '.claude', 'CLAUDE.local.md'), 'utf-8');
    expect(content).toContain('VIBEPILOT_MANAGED');
    expect(content).toContain('VibePilot Preview');
  });

  it('clean() removes CLAUDE.local.md', async () => {
    await manager.write(cdpUrl);
    await manager.clean();

    await expect(fs.access(path.join(tmpDir, '.claude', 'CLAUDE.local.md'))).rejects.toThrow();
  });

  it('creates .claude directory if it does not exist', async () => {
    await manager.write(cdpUrl);

    const stat = await fs.stat(path.join(tmpDir, '.claude'));
    expect(stat.isDirectory()).toBe(true);
  });
});
