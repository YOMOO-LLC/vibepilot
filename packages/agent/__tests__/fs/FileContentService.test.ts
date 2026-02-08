import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileContentService } from '../../src/fs/FileContentService.js';

describe('FileContentService', () => {
  let service: FileContentService;
  let tmpDir: string;

  beforeEach(async () => {
    service = new FileContentService();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcs-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('static methods', () => {
    it('getLanguage returns correct language for common extensions', () => {
      expect(FileContentService.getLanguage('index.ts')).toBe('typescript');
      expect(FileContentService.getLanguage('app.tsx')).toBe('typescript');
      expect(FileContentService.getLanguage('main.js')).toBe('javascript');
      expect(FileContentService.getLanguage('style.css')).toBe('css');
      expect(FileContentService.getLanguage('data.json')).toBe('json');
      expect(FileContentService.getLanguage('README.md')).toBe('markdown');
      expect(FileContentService.getLanguage('script.py')).toBe('python');
      expect(FileContentService.getLanguage('main.go')).toBe('go');
      expect(FileContentService.getLanguage('lib.rs')).toBe('rust');
      expect(FileContentService.getLanguage('config.yml')).toBe('yaml');
      expect(FileContentService.getLanguage('config.yaml')).toBe('yaml');
      expect(FileContentService.getLanguage('page.html')).toBe('html');
      expect(FileContentService.getLanguage('setup.sh')).toBe('shell');
    });

    it('getLanguage returns plaintext for unknown extensions', () => {
      expect(FileContentService.getLanguage('file.xyz')).toBe('plaintext');
      expect(FileContentService.getLanguage('file')).toBe('plaintext');
    });

    it('getLanguage handles special filenames', () => {
      expect(FileContentService.getLanguage('Dockerfile')).toBe('dockerfile');
      expect(FileContentService.getLanguage('Makefile')).toBe('makefile');
    });

    it('isImage detects image extensions', () => {
      expect(FileContentService.isImage('photo.png')).toBe(true);
      expect(FileContentService.isImage('photo.jpg')).toBe(true);
      expect(FileContentService.isImage('photo.jpeg')).toBe(true);
      expect(FileContentService.isImage('anim.gif')).toBe(true);
      expect(FileContentService.isImage('icon.svg')).toBe(true);
      expect(FileContentService.isImage('image.webp')).toBe(true);
      expect(FileContentService.isImage('favicon.ico')).toBe(true);
      expect(FileContentService.isImage('bitmap.bmp')).toBe(true);
    });

    it('isImage returns false for non-image files', () => {
      expect(FileContentService.isImage('index.ts')).toBe(false);
      expect(FileContentService.isImage('style.css')).toBe(false);
      expect(FileContentService.isImage('data.json')).toBe(false);
    });

    it('getMimeType returns correct MIME types for images', () => {
      expect(FileContentService.getMimeType('photo.png')).toBe('image/png');
      expect(FileContentService.getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(FileContentService.getMimeType('icon.svg')).toBe('image/svg+xml');
      expect(FileContentService.getMimeType('image.webp')).toBe('image/webp');
    });

    it('getMimeType returns text/plain for non-image files', () => {
      expect(FileContentService.getMimeType('index.ts')).toBe('text/plain');
    });
  });

  describe('read', () => {
    it('reads a text file with correct metadata', async () => {
      const filePath = path.join(tmpDir, 'test.ts');
      await fs.writeFile(filePath, 'const x = 1;', 'utf-8');

      const result = await service.read(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.content).toBe('const x = 1;');
      expect(result.encoding).toBe('utf-8');
      expect(result.language).toBe('typescript');
      expect(result.mimeType).toBe('text/plain');
      expect(result.size).toBeGreaterThan(0);
      expect(result.readonly).toBe(false);
    });

    it('reads a Python file with correct language', async () => {
      const filePath = path.join(tmpDir, 'script.py');
      await fs.writeFile(filePath, 'print("hello")', 'utf-8');

      const result = await service.read(filePath);

      expect(result.language).toBe('python');
      expect(result.encoding).toBe('utf-8');
    });

    it('reads an image file as base64 with readonly flag', async () => {
      const filePath = path.join(tmpDir, 'test.png');
      const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      await fs.writeFile(filePath, imageData);

      const result = await service.read(filePath);

      expect(result.encoding).toBe('base64');
      expect(result.content).toBe(imageData.toString('base64'));
      expect(result.mimeType).toBe('image/png');
      expect(result.readonly).toBe(true);
      expect(result.language).toBe('');
    });

    it('throws for nonexistent file', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.ts');
      await expect(service.read(filePath)).rejects.toThrow();
    });
  });

  describe('write', () => {
    it('writes content and returns file size', async () => {
      const filePath = path.join(tmpDir, 'output.ts');
      const content = 'export const hello = "world";';

      const size = await service.write(filePath, content);

      expect(size).toBeGreaterThan(0);
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    it('overwrites existing file', async () => {
      const filePath = path.join(tmpDir, 'existing.ts');
      await fs.writeFile(filePath, 'old content', 'utf-8');

      await service.write(filePath, 'new content');

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('new content');
    });
  });
});
