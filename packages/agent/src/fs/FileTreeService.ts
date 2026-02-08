import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileNode } from '@vibepilot/protocol';

const IGNORED_PATHS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.DS_Store',
]);

export class FileTreeService {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
  }

  async list(dirPath: string, depth: number = 1): Promise<FileNode[]> {
    const resolvedPath = path.resolve(dirPath);

    // Prevent path traversal - ensure the resolved path is within or equal to root
    if (!resolvedPath.startsWith(this.rootPath)) {
      throw new Error('Path traversal not allowed');
    }

    return this.listRecursive(resolvedPath, depth);
  }

  private async listRecursive(
    dirPath: string,
    depth: number,
    currentDepth: number = 0
  ): Promise<FileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      // Filter out ignored paths
      if (IGNORED_PATHS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const type = entry.isDirectory() ? 'directory' : 'file';

      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        type,
      };

      // Recursively list children if it's a directory and we haven't reached max depth
      if (type === 'directory' && currentDepth < depth - 1) {
        try {
          node.children = await this.listRecursive(
            fullPath,
            depth,
            currentDepth + 1
          );
        } catch (error) {
          // Skip directories we can't read (permission issues, etc.)
          continue;
        }
      }

      nodes.push(node);
    }

    // Sort: directories first, then files, both alphabetically
    return nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'directory' ? -1 : 1;
    });
  }
}
