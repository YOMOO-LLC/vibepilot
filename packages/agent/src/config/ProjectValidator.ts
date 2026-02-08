import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export class ProjectValidator {
  private static FORBIDDEN_PATHS = new Set([
    '/',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/System',
    '/Library',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ]);

  // 允许的 /var 子目录（如 /var/folders/xxx - macOS 临时目录）
  private static ALLOWED_VAR_SUBDIRS = ['/var/folders', '/var/tmp'];

  /**
   * 验证项目路径的安全性和可访问性
   */
  static async validate(projectPath: string): Promise<{
    valid: boolean;
    error?: string;
    resolvedPath?: string;
  }> {
    try {
      // 解析为绝对路径
      const resolved = path.resolve(projectPath);

      // 检查是否为禁用路径
      if (this.isForbiddenPath(resolved)) {
        return {
          valid: false,
          error: 'Cannot use system directories as project paths',
        };
      }

      // 检查路径是否存在
      let stat;
      try {
        stat = await fs.stat(resolved);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return {
            valid: false,
            error: 'Path does not exist',
          };
        }
        if (err.code === 'EACCES') {
          return {
            valid: false,
            error: 'Permission denied',
          };
        }
        throw err;
      }

      // 验证是目录而非文件
      if (!stat.isDirectory()) {
        return {
          valid: false,
          error: 'Path must be a directory',
        };
      }

      // 测试读取权限
      try {
        await fs.access(resolved, fs.constants.R_OK);
      } catch (err) {
        return {
          valid: false,
          error: 'Directory is not readable',
        };
      }

      // 解析符号链接并重新验证
      const realPath = await fs.realpath(resolved);
      if (this.isForbiddenPath(realPath)) {
        return {
          valid: false,
          error: 'Symlink target is a system directory',
        };
      }

      return {
        valid: true,
        resolvedPath: realPath,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: `Validation failed: ${err.message}`,
      };
    }
  }

  /**
   * 检查路径是否为禁用的系统路径
   */
  private static isForbiddenPath(resolved: string): boolean {
    // 精确匹配
    if (this.FORBIDDEN_PATHS.has(resolved)) {
      return true;
    }

    // 检查是否为禁用路径的子路径（但排除用户目录和临时目录）
    const normalized = path.normalize(resolved);

    // 允许用户主目录
    if (process.platform !== 'win32' && normalized.startsWith('/Users/')) {
      return false;
    }
    if (process.platform === 'win32' && normalized.startsWith('C:\\Users\\')) {
      return false;
    }

    // 允许特定的 /var 子目录（如 macOS 临时目录 /var/folders）
    for (const allowed of this.ALLOWED_VAR_SUBDIRS) {
      if (normalized.startsWith(allowed + path.sep)) {
        return false;
      }
    }

    // 检查禁用路径
    for (const forbidden of this.FORBIDDEN_PATHS) {
      if (normalized === forbidden) {
        return true;
      }
      if (normalized.startsWith(forbidden + path.sep)) {
        return true;
      }
    }

    return false;
  }
}
