import * as fs from 'fs/promises';
import * as path from 'path';

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
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
    const isImage = FileContentService.isImage(filePath);
    const stat = await fs.stat(filePath);

    if (isImage) {
      const buffer = await fs.readFile(filePath);
      return {
        filePath,
        content: buffer.toString('base64'),
        encoding: 'base64',
        language: '',
        mimeType: FileContentService.getMimeType(filePath),
        size: stat.size,
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
      size: stat.size,
      readonly: false,
    };
  }

  async write(filePath: string, content: string): Promise<number> {
    await fs.writeFile(filePath, content, 'utf-8');
    const stat = await fs.stat(filePath);
    return stat.size;
  }
}
