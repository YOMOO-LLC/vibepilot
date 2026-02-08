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

  constructor(rootPath: string) {
    super();
    this.rootPath = rootPath;
  }

  start(): void {
    this.watcher = chokidar.watch(this.rootPath, {
      ignored: (path: string) => {
        return IGNORED_PATTERNS.some((pattern) => {
          const regex = new RegExp(
            pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
          );
          return regex.test(path);
        });
      },
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('add', (path: string) => {
        this.emit('add', path);
      })
      .on('change', (path: string) => {
        this.emit('change', path);
      })
      .on('unlink', (path: string) => {
        this.emit('unlink', path);
      })
      .on('addDir', (path: string) => {
        this.emit('addDir', path);
      })
      .on('unlinkDir', (path: string) => {
        this.emit('unlinkDir', path);
      });
  }

  async stop(): Promise<void> {
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
