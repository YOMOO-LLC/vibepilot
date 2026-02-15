import { existsSync, statSync, chmodSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from './logger.js';

/**
 * Check and fix node-pty spawn-helper permissions on startup.
 *
 * This ensures node-pty works correctly across different installation methods
 * (npm, pnpm, yarn) and prevents "posix_spawnp failed" errors.
 */
export function checkNodePtyPermissions(): void {
  try {
    // Find node-pty installation path
    const nodePtyPath = require.resolve('node-pty');
    const nodePtyRoot = dirname(dirname(nodePtyPath)); // Go up from lib/index.js to root

    // Determine platform-specific prebuild path
    const platform = process.platform;
    const arch = process.arch;
    const spawnHelperPath = join(nodePtyRoot, 'prebuilds', `${platform}-${arch}`, 'spawn-helper');

    // Check if spawn-helper exists
    if (!existsSync(spawnHelperPath)) {
      logger.warn(
        { spawnHelperPath, platform, arch },
        'spawn-helper not found - terminals may not work. Run: pnpm install --force'
      );
      return;
    }

    // Check current permissions
    const stats = statSync(spawnHelperPath);
    const mode = stats.mode;
    const hasExecutePerm = (mode & 0o111) !== 0; // Check if any execute bit is set

    if (!hasExecutePerm) {
      logger.warn(
        { spawnHelperPath, currentMode: mode.toString(8) },
        'spawn-helper missing execute permission - fixing automatically'
      );

      // Fix permissions
      chmodSync(spawnHelperPath, 0o755);
      logger.info({ spawnHelperPath }, 'spawn-helper permissions fixed (now 755)');
    } else {
      logger.debug({ spawnHelperPath }, 'spawn-helper permissions OK');
    }
  } catch (err: any) {
    logger.error(
      { err: err.message },
      'Failed to check node-pty permissions - terminals may not work'
    );
  }
}
