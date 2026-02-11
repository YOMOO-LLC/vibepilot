import * as fs from 'fs/promises';
import * as path from 'path';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.bmp',
]);

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'plaintext',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.dockerfile': 'dockerfile',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'html',
  '.svelte': 'html',
};

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
};

export interface FileReadResult {
  filePath: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  language: string;
  mimeType: string;
  size: number;
  readonly: boolean;
}

export class FileContentService {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
  }

  private validatePath(filePath: string): void {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.rootPath + path.sep) && resolved !== this.rootPath) {
      throw new Error('Path outside workspace');
    }
  }

  static getLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    // Handle special filenames
    const basename = path.basename(filePath).toLowerCase();
    if (basename === 'dockerfile') return 'dockerfile';
    if (basename === 'makefile') return 'makefile';
    return LANGUAGE_MAP[ext] || 'plaintext';
  }

  static isImage(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  }

  static getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_MAP[ext] || 'text/plain';
  }

  async read(filePath: string): Promise<FileReadResult> {
    this.validatePath(filePath);
    const isImage = FileContentService.isImage(filePath);

    if (isImage) {
      const buffer = await fs.readFile(filePath);
      return {
        filePath,
        content: buffer.toString('base64'),
        encoding: 'base64',
        language: '',
        mimeType: FileContentService.getMimeType(filePath),
        size: buffer.byteLength,
        readonly: true,
      };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return {
      filePath,
      content,
      encoding: 'utf-8',
      language: FileContentService.getLanguage(filePath),
      mimeType: 'text/plain',
      size: Buffer.byteLength(content, 'utf-8'),
      readonly: false,
    };
  }

  async write(filePath: string, content: string): Promise<number> {
    this.validatePath(filePath);
    await fs.writeFile(filePath, content, { encoding: 'utf-8', mode: 0o644 });
    return Buffer.byteLength(content, 'utf-8');
  }
}
