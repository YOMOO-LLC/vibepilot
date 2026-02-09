import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileWatcher } from '../../src/fs/FileWatcher.js';
import chokidar from 'chokidar';

vi.mock('chokidar');

const mockChokidar = vi.mocked(chokidar);

describe('FileWatcher', () => {
  let watcher: FileWatcher;
  let mockWatcherInstance: {
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

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
    vi.useRealTimers();
  });

  // Helper: get chokidar callback by event name
  function getChokidarCallback(event: string): ((path: string) => void) | undefined {
    return mockWatcherInstance.on.mock.calls.find((call) => call[0] === event)?.[1];
  }

  describe('start', () => {
    it('emits "change" event on file modification (after debounce)', () => {
      watcher = new FileWatcher('/test/root');
      const changeHandler = vi.fn();

      watcher.on('change', changeHandler);
      watcher.start();

      const onChangeCallback = getChokidarCallback('change');
      expect(onChangeCallback).toBeDefined();
      onChangeCallback?.('/test/root/file.ts');

      // Not emitted yet (debounce pending)
      expect(changeHandler).not.toHaveBeenCalled();

      // Advance past debounce
      vi.advanceTimersByTime(300);
      expect(changeHandler).toHaveBeenCalledWith('/test/root/file.ts');
    });

    it('emits "add" event on file creation (after debounce)', () => {
      watcher = new FileWatcher('/test/root');
      const addHandler = vi.fn();

      watcher.on('add', addHandler);
      watcher.start();

      const onAddCallback = getChokidarCallback('add');
      expect(onAddCallback).toBeDefined();
      onAddCallback?.('/test/root/new-file.ts');

      vi.advanceTimersByTime(300);
      expect(addHandler).toHaveBeenCalledWith('/test/root/new-file.ts');
    });

    it('emits "unlink" event on file deletion (after debounce)', () => {
      watcher = new FileWatcher('/test/root');
      const unlinkHandler = vi.fn();

      watcher.on('unlink', unlinkHandler);
      watcher.start();

      const onUnlinkCallback = getChokidarCallback('unlink');
      expect(onUnlinkCallback).toBeDefined();
      onUnlinkCallback?.('/test/root/deleted-file.ts');

      vi.advanceTimersByTime(300);
      expect(unlinkHandler).toHaveBeenCalledWith('/test/root/deleted-file.ts');
    });

    it('emits "addDir" event on directory creation (after debounce)', () => {
      watcher = new FileWatcher('/test/root');
      const addDirHandler = vi.fn();

      watcher.on('addDir', addDirHandler);
      watcher.start();

      const onAddDirCallback = getChokidarCallback('addDir');
      expect(onAddDirCallback).toBeDefined();
      onAddDirCallback?.('/test/root/new-dir');

      vi.advanceTimersByTime(300);
      expect(addDirHandler).toHaveBeenCalledWith('/test/root/new-dir');
    });

    it('emits "unlinkDir" event on directory deletion (after debounce)', () => {
      watcher = new FileWatcher('/test/root');
      const unlinkDirHandler = vi.fn();

      watcher.on('unlinkDir', unlinkDirHandler);
      watcher.start();

      const onUnlinkDirCallback = getChokidarCallback('unlinkDir');
      expect(onUnlinkDirCallback).toBeDefined();
      onUnlinkDirCallback?.('/test/root/deleted-dir');

      vi.advanceTimersByTime(300);
      expect(unlinkDirHandler).toHaveBeenCalledWith('/test/root/deleted-dir');
    });

    it('ignores node_modules and .git', () => {
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

  describe('debounce', () => {
    it('deduplicates rapid changes to the same file', () => {
      watcher = new FileWatcher('/test/root');
      const changeHandler = vi.fn();

      watcher.on('change', changeHandler);
      watcher.start();

      const onChangeCallback = getChokidarCallback('change')!;

      // Rapid 3x change on the same file
      onChangeCallback('/test/root/file.ts');
      onChangeCallback('/test/root/file.ts');
      onChangeCallback('/test/root/file.ts');

      vi.advanceTimersByTime(300);

      // Only emitted once
      expect(changeHandler).toHaveBeenCalledTimes(1);
      expect(changeHandler).toHaveBeenCalledWith('/test/root/file.ts');
    });

    it('emits separately for different files in one batch', () => {
      watcher = new FileWatcher('/test/root');
      const changeHandler = vi.fn();

      watcher.on('change', changeHandler);
      watcher.start();

      const onChangeCallback = getChokidarCallback('change')!;

      onChangeCallback('/test/root/a.ts');
      onChangeCallback('/test/root/b.ts');

      vi.advanceTimersByTime(300);

      expect(changeHandler).toHaveBeenCalledTimes(2);
      expect(changeHandler).toHaveBeenCalledWith('/test/root/a.ts');
      expect(changeHandler).toHaveBeenCalledWith('/test/root/b.ts');
    });

    it('uses the last event type when same file has multiple event types', () => {
      watcher = new FileWatcher('/test/root');
      const addHandler = vi.fn();
      const changeHandler = vi.fn();

      watcher.on('add', addHandler);
      watcher.on('change', changeHandler);
      watcher.start();

      const onAddCallback = getChokidarCallback('add')!;
      const onChangeCallback = getChokidarCallback('change')!;

      // File is first added, then immediately changed
      onAddCallback('/test/root/file.ts');
      onChangeCallback('/test/root/file.ts');

      vi.advanceTimersByTime(300);

      // Only the last event (change) should fire
      expect(addHandler).not.toHaveBeenCalled();
      expect(changeHandler).toHaveBeenCalledTimes(1);
    });

    it('supports custom debounce interval', () => {
      watcher = new FileWatcher('/test/root', 500);
      const changeHandler = vi.fn();

      watcher.on('change', changeHandler);
      watcher.start();

      const onChangeCallback = getChokidarCallback('change')!;
      onChangeCallback('/test/root/file.ts');

      vi.advanceTimersByTime(300);
      expect(changeHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(changeHandler).toHaveBeenCalledTimes(1);
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

    it('clears pending events on stop', async () => {
      watcher = new FileWatcher('/test/root');
      const changeHandler = vi.fn();

      watcher.on('change', changeHandler);
      watcher.start();

      const onChangeCallback = getChokidarCallback('change')!;
      onChangeCallback('/test/root/file.ts');

      // Stop before debounce fires
      await watcher.stop();

      vi.advanceTimersByTime(300);
      expect(changeHandler).not.toHaveBeenCalled();
    });
  });
});
