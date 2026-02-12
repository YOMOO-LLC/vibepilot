import { mkdir, readlink, unlink } from 'fs/promises';
import { join } from 'path';

export class BrowserProfileManager {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async getProfilePath(projectId: string): Promise<string> {
    const profilePath = join(this.basePath, projectId);
    await mkdir(profilePath, { recursive: true });
    return profilePath;
  }

  /** Remove Chrome lock files if the owning process is no longer alive. */
  async clearStaleLock(projectId: string): Promise<void> {
    const profilePath = join(this.basePath, projectId);
    const lockPath = join(profilePath, 'SingletonLock');

    let target: string;
    try {
      target = await readlink(lockPath);
    } catch {
      return; // No lock file — nothing to do
    }

    // Chrome SingletonLock symlink target format: hostname-pid
    const match = target.match(/-(\d+)$/);
    if (!match) {
      // Can't parse PID — remove to unblock
      await this.removeLockFiles(profilePath);
      return;
    }

    const pid = parseInt(match[1], 10);
    if (!this.isProcessAlive(pid)) {
      await this.removeLockFiles(profilePath);
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async removeLockFiles(profilePath: string): Promise<void> {
    for (const file of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      try {
        await unlink(join(profilePath, file));
      } catch {
        // May not exist
      }
    }
  }
}
