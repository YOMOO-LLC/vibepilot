import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';

type FileWatcherEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.DS_Store',
];

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private rootPath: string;
  private pendingEvents = new Map<string, { event: FileWatcherEvent; path: string }>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(rootPath: string, debounceMs: number = 300) {
    super();
    this.rootPath = rootPath;
    this.debounceMs = debounceMs;
  }

  start(): void {
    this.watcher = chokidar.watch(this.rootPath, {
      ignored: (path: string) => {
        return IGNORED_PATTERNS.some((pattern) => {
          const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
          return regex.test(path);
        });
      },
      persistent: true,
      ignoreInitial: true,
    });

    const scheduleEvent = (event: FileWatcherEvent, filePath: string) => {
      this.pendingEvents.set(filePath, { event, path: filePath });
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
      }
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.debounceMs);
    };

    this.watcher
      .on('add', (path: string) => scheduleEvent('add', path))
      .on('change', (path: string) => scheduleEvent('change', path))
      .on('unlink', (path: string) => scheduleEvent('unlink', path))
      .on('addDir', (path: string) => scheduleEvent('addDir', path))
      .on('unlinkDir', (path: string) => scheduleEvent('unlinkDir', path));
  }

  private flush(): void {
    const events = new Map(this.pendingEvents);
    this.pendingEvents.clear();
    this.flushTimer = null;

    for (const { event, path } of events.values()) {
      this.emit(event, path);
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingEvents.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  // Type-safe event overrides
  override on(event: FileWatcherEvent, listener: (path: string) => void): this {
    return super.on(event, listener);
  }

  override emit(event: FileWatcherEvent, path: string): boolean {
    return super.emit(event, path);
  }
}
