import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BrowserProfileManager } from '../../src/browser/BrowserProfileManager.js';

describe('BrowserProfileManager', () => {
  let tmpDir: string;
  let manager: BrowserProfileManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpm-test-'));
    manager = new BrowserProfileManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates profile directory for a project', async () => {
    const profilePath = await manager.getProfilePath('project-1');
    const stat = await fs.stat(profilePath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('returns same path for same project', async () => {
    const path1 = await manager.getProfilePath('project-1');
    const path2 = await manager.getProfilePath('project-1');
    expect(path1).toBe(path2);
  });

  it('returns different paths for different projects', async () => {
    const path1 = await manager.getProfilePath('project-1');
    const path2 = await manager.getProfilePath('project-2');
    expect(path1).not.toBe(path2);
  });

  it('profile path is under base directory', async () => {
    const profilePath = await manager.getProfilePath('project-1');
    expect(profilePath.startsWith(tmpDir)).toBe(true);
  });
});
