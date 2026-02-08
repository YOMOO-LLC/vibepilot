import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileTreeService } from '../../src/fs/FileTreeService.js';
import type { FileNode } from '@vibepilot/protocol';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('FileTreeService', () => {
  let service: FileTreeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FileTreeService('/test/root');
  });

  describe('list', () => {
    it('lists directory contents', async () => {
      const mockEntries = [
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
        { name: 'dir1', isDirectory: () => true, isFile: () => false },
      ];

      mockFs.readdir.mockResolvedValue(mockEntries as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const result = await service.list('/test/root', 1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'dir1',
        path: '/test/root/dir1',
        type: 'directory',
      });
      expect(result[1]).toEqual({
        name: 'file1.ts',
        path: '/test/root/file1.ts',
        type: 'file',
      });
    });

    it('filters node_modules, .git, dist, etc.', async () => {
      const mockEntries = [
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: '.git', isDirectory: () => true, isFile: () => false },
        { name: 'dist', isDirectory: () => true, isFile: () => false },
        { name: '.next', isDirectory: () => true, isFile: () => false },
        { name: '.turbo', isDirectory: () => true, isFile: () => false },
        { name: 'coverage', isDirectory: () => true, isFile: () => false },
        { name: '.DS_Store', isDirectory: () => false, isFile: () => true },
        { name: 'file.ts', isDirectory: () => false, isFile: () => true },
      ];

      mockFs.readdir.mockResolvedValue(mockEntries as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const result = await service.list('/test/root', 1);

      expect(result).toHaveLength(2);
      expect(result.find((n) => n.name === 'src')).toBeDefined();
      expect(result.find((n) => n.name === 'file.ts')).toBeDefined();
      expect(result.find((n) => n.name === 'node_modules')).toBeUndefined();
      expect(result.find((n) => n.name === '.git')).toBeUndefined();
      expect(result.find((n) => n.name === 'dist')).toBeUndefined();
      expect(result.find((n) => n.name === '.next')).toBeUndefined();
      expect(result.find((n) => n.name === '.turbo')).toBeUndefined();
      expect(result.find((n) => n.name === 'coverage')).toBeUndefined();
      expect(result.find((n) => n.name === '.DS_Store')).toBeUndefined();
    });

    it('sorts directories before files alphabetically', async () => {
      const mockEntries = [
        { name: 'zebra.ts', isDirectory: () => false, isFile: () => true },
        { name: 'apple', isDirectory: () => true, isFile: () => false },
        { name: 'banana.js', isDirectory: () => false, isFile: () => true },
        { name: 'zoo', isDirectory: () => true, isFile: () => false },
      ];

      mockFs.readdir.mockResolvedValue(mockEntries as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const result = await service.list('/test/root', 1);

      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('apple');
      expect(result[0].type).toBe('directory');
      expect(result[1].name).toBe('zoo');
      expect(result[1].type).toBe('directory');
      expect(result[2].name).toBe('banana.js');
      expect(result[2].type).toBe('file');
      expect(result[3].name).toBe('zebra.ts');
      expect(result[3].type).toBe('file');
    });

    it('prevents path traversal with ../', async () => {
      await expect(
        service.list('/test/root/../../../etc', 1)
      ).rejects.toThrow('Path traversal not allowed');

      await expect(
        service.list('/test/root/subdir/../../outside', 1)
      ).rejects.toThrow('Path traversal not allowed');
    });

    it('supports depth parameter for recursive listing', async () => {
      const mockRootEntries = [
        { name: 'dir1', isDirectory: () => true, isFile: () => false },
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
      ];

      const mockDir1Entries = [
        { name: 'subfile.ts', isDirectory: () => false, isFile: () => true },
        { name: 'subdir', isDirectory: () => true, isFile: () => false },
      ];

      const mockSubdirEntries = [
        { name: 'deep.ts', isDirectory: () => false, isFile: () => true },
      ];

      mockFs.readdir
        .mockResolvedValueOnce(mockRootEntries as any)
        .mockResolvedValueOnce(mockDir1Entries as any)
        .mockResolvedValueOnce(mockSubdirEntries as any);

      mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const result = await service.list('/test/root', 3);

      expect(result).toHaveLength(2);

      const dir1 = result.find((n) => n.name === 'dir1');
      expect(dir1).toBeDefined();
      expect(dir1?.children).toBeDefined();
      expect(dir1?.children).toHaveLength(2);

      const subdir = dir1?.children?.find((n) => n.name === 'subdir');
      expect(subdir).toBeDefined();
      expect(subdir?.children).toBeDefined();
      expect(subdir?.children).toHaveLength(1);
      expect(subdir?.children?.[0].name).toBe('deep.ts');
    });

    it('handles non-existent paths gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(service.list('/test/root/nonexistent', 1)).rejects.toThrow();
    });

    it('handles empty directories', async () => {
      mockFs.readdir.mockResolvedValue([]);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      const result = await service.list('/test/root/empty', 1);

      expect(result).toEqual([]);
    });

    it('uses depth=1 by default', async () => {
      const mockRootEntries = [
        { name: 'dir1', isDirectory: () => true, isFile: () => false },
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
      ];

      mockFs.readdir.mockResolvedValueOnce(mockRootEntries as any);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const result = await service.list('/test/root');

      expect(result).toHaveLength(2);
      const dir1 = result.find((n) => n.name === 'dir1');
      expect(dir1?.children).toBeUndefined();
    });
  });
});
