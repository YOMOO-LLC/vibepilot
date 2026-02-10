import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';

// Mock fs.access to control which paths "exist"
vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

// Must import after mocking
import { ChromeDetector } from '../../src/browser/ChromeDetector.js';

describe('ChromeDetector', () => {
  const mockAccess = vi.mocked(fs.access);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects Chrome when a known path exists', async () => {
    // First path fails, second succeeds
    mockAccess.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);

    const path = await ChromeDetector.detect();
    expect(path).toBeTruthy();
    expect(typeof path).toBe('string');
  });

  it('returns null when no Chrome found', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const path = await ChromeDetector.detect();
    expect(path).toBeNull();
  });

  it('returns paths for the current platform', () => {
    const paths = ChromeDetector.getPlatformPaths();
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  });
});
