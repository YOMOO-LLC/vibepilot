import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectValidator } from '../../src/config/ProjectValidator.js';

describe('ProjectValidator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibepilot-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validate', () => {
    it('应该接受有效的目录路径', async () => {
      const result = await ProjectValidator.validate(tempDir);
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('应该解析相对路径为绝对路径', async () => {
      const result = await ProjectValidator.validate('.');
      expect(result.valid).toBe(true);
      expect(path.isAbsolute(result.resolvedPath!)).toBe(true);
    });

    it('应该拒绝系统目录 (/etc)', async () => {
      const result = await ProjectValidator.validate('/etc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('system directories');
    });

    it('应该拒绝系统目录 (/usr)', async () => {
      const result = await ProjectValidator.validate('/usr');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('system directories');
    });

    it('应该拒绝根目录', async () => {
      const result = await ProjectValidator.validate('/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('system directories');
    });

    it('应该拒绝不存在的路径', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist');
      const result = await ProjectValidator.validate(nonExistentPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('应该拒绝文件路径（仅接受目录）', async () => {
      const filePath = path.join(tempDir, 'test-file.txt');
      await fs.writeFile(filePath, 'test');
      const result = await ProjectValidator.validate(filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a directory');
    });

    it('应该处理符号链接', async () => {
      const realDir = path.join(tempDir, 'real-dir');
      const symlinkPath = path.join(tempDir, 'symlink-dir');
      await fs.mkdir(realDir);
      await fs.symlink(realDir, symlinkPath);

      const result = await ProjectValidator.validate(symlinkPath);
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(await fs.realpath(realDir));
    });

    it('应该拒绝指向系统目录的符号链接', async () => {
      const symlinkPath = path.join(tempDir, 'bad-symlink');
      const systemPath = process.platform === 'darwin' ? '/System' : '/usr';

      try {
        await fs.symlink(systemPath, symlinkPath);
      } catch (err: any) {
        // 如果没有权限创建符号链接，跳过此测试
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          console.warn('Skipping symlink test: insufficient permissions');
          return;
        }
        throw err;
      }

      const result = await ProjectValidator.validate(symlinkPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Symlink target is a system directory');
    });

    it('应该允许用户主目录', async () => {
      const homeDir = os.homedir();
      const result = await ProjectValidator.validate(homeDir);
      expect(result.valid).toBe(true);
    });
  });
});
