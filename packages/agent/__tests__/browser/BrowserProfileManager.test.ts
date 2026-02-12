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

  describe('clearStaleLock', () => {
    it('removes lock files when PID is dead', async () => {
      const profilePath = await manager.getProfilePath('project-1');
      // Create a fake SingletonLock symlink pointing to a dead PID
      await fs.symlink('myhostname-999999', path.join(profilePath, 'SingletonLock'));
      await fs.writeFile(path.join(profilePath, 'SingletonSocket'), '');
      await fs.writeFile(path.join(profilePath, 'SingletonCookie'), '');

      await manager.clearStaleLock('project-1');

      // All lock files should be removed
      await expect(fs.lstat(path.join(profilePath, 'SingletonLock'))).rejects.toThrow();
      await expect(fs.lstat(path.join(profilePath, 'SingletonSocket'))).rejects.toThrow();
      await expect(fs.lstat(path.join(profilePath, 'SingletonCookie'))).rejects.toThrow();
    });

    it('preserves lock files when PID is alive', async () => {
      const profilePath = await manager.getProfilePath('project-1');
      // Use current process PID (guaranteed alive)
      await fs.symlink(`myhostname-${process.pid}`, path.join(profilePath, 'SingletonLock'));

      await manager.clearStaleLock('project-1');

      // Lock should still exist
      const stat = await fs.lstat(path.join(profilePath, 'SingletonLock'));
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('handles missing lock file gracefully', async () => {
      await manager.getProfilePath('project-1');
      // No lock file exists — should not throw
      await expect(manager.clearStaleLock('project-1')).resolves.not.toThrow();
    });

    it('removes unparseable lock file', async () => {
      const profilePath = await manager.getProfilePath('project-1');
      // Symlink with no PID — can't determine if alive, remove it
      await fs.symlink('garbage-data', path.join(profilePath, 'SingletonLock'));

      await manager.clearStaleLock('project-1');

      await expect(fs.lstat(path.join(profilePath, 'SingletonLock'))).rejects.toThrow();
    });
  });
});
