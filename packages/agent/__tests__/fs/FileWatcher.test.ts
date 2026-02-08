import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileWatcher } from '../../src/fs/FileWatcher.js';
import chokidar, { type FSWatcher } from 'chokidar';

vi.mock('chokidar');

const mockChokidar = vi.mocked(chokidar);

describe('FileWatcher', () => {
  let watcher: FileWatcher;
  let mockWatcherInstance: {
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockWatcherInstance = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockChokidar.watch.mockReturnValue(mockWatcherInstance as any);
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('emits "change" event on file modification', async () => {
      watcher = new FileWatcher('/test/root');
      const changeHandler = vi.fn();

      watcher.on('change', changeHandler);
      watcher.start();

      // Simulate chokidar 'change' event
      const onChangeCallback = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'change'
      )?.[1];

      expect(onChangeCallback).toBeDefined();
      onChangeCallback?.('/test/root/file.ts');

      expect(changeHandler).toHaveBeenCalledWith('/test/root/file.ts');
    });

    it('emits "add" event on file creation', async () => {
      watcher = new FileWatcher('/test/root');
      const addHandler = vi.fn();

      watcher.on('add', addHandler);
      watcher.start();

      const onAddCallback = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'add'
      )?.[1];

      expect(onAddCallback).toBeDefined();
      onAddCallback?.('/test/root/new-file.ts');

      expect(addHandler).toHaveBeenCalledWith('/test/root/new-file.ts');
    });

    it('emits "unlink" event on file deletion', async () => {
      watcher = new FileWatcher('/test/root');
      const unlinkHandler = vi.fn();

      watcher.on('unlink', unlinkHandler);
      watcher.start();

      const onUnlinkCallback = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlink'
      )?.[1];

      expect(onUnlinkCallback).toBeDefined();
      onUnlinkCallback?.('/test/root/deleted-file.ts');

      expect(unlinkHandler).toHaveBeenCalledWith('/test/root/deleted-file.ts');
    });

    it('emits "addDir" event on directory creation', async () => {
      watcher = new FileWatcher('/test/root');
      const addDirHandler = vi.fn();

      watcher.on('addDir', addDirHandler);
      watcher.start();

      const onAddDirCallback = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'addDir'
      )?.[1];

      expect(onAddDirCallback).toBeDefined();
      onAddDirCallback?.('/test/root/new-dir');

      expect(addDirHandler).toHaveBeenCalledWith('/test/root/new-dir');
    });

    it('emits "unlinkDir" event on directory deletion', async () => {
      watcher = new FileWatcher('/test/root');
      const unlinkDirHandler = vi.fn();

      watcher.on('unlinkDir', unlinkDirHandler);
      watcher.start();

      const onUnlinkDirCallback = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlinkDir'
      )?.[1];

      expect(onUnlinkDirCallback).toBeDefined();
      onUnlinkDirCallback?.('/test/root/deleted-dir');

      expect(unlinkDirHandler).toHaveBeenCalledWith('/test/root/deleted-dir');
    });

    it('ignores node_modules and .git', async () => {
      watcher = new FileWatcher('/test/root');
      watcher.start();

      expect(mockChokidar.watch).toHaveBeenCalledWith('/test/root', {
        ignored: expect.any(Function),
        persistent: true,
        ignoreInitial: true,
      });

      const ignoredFn = (mockChokidar.watch as any).mock.calls[0][1].ignored;

      expect(ignoredFn('/test/root/node_modules/pkg/file.js')).toBe(true);
      expect(ignoredFn('/test/root/.git/config')).toBe(true);
      expect(ignoredFn('/test/root/dist/bundle.js')).toBe(true);
      expect(ignoredFn('/test/root/.next/cache')).toBe(true);
      expect(ignoredFn('/test/root/.turbo/cache')).toBe(true);
      expect(ignoredFn('/test/root/coverage/report.html')).toBe(true);
      expect(ignoredFn('/test/root/.DS_Store')).toBe(true);
      expect(ignoredFn('/test/root/src/file.ts')).toBe(false);
    });
  });

  describe('stop', () => {
    it('closes the chokidar watcher', async () => {
      watcher = new FileWatcher('/test/root');
      watcher.start();

      await watcher.stop();

      expect(mockWatcherInstance.close).toHaveBeenCalled();
    });

    it('handles stop when not started', async () => {
      watcher = new FileWatcher('/test/root');

      await expect(watcher.stop()).resolves.not.toThrow();
    });
  });
});
