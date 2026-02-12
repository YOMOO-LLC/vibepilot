import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import CDP from 'chrome-remote-interface';
import { ChromeDetector } from './ChromeDetector.js';
import { BrowserProfileManager } from './BrowserProfileManager.js';
import { ScreencastStream } from './ScreencastStream.js';
import { InputHandler } from './InputHandler.js';
import { CursorProbe } from './CursorProbe.js';
import { AdaptiveQuality } from './AdaptiveQuality.js';
import type { BrowserInputPayload, BrowserStartPayload } from '@vibepilot/protocol';

interface BrowserInfo {
  cdpPort: number;
  viewportWidth: number;
  viewportHeight: number;
}

export class BrowserService extends EventEmitter {
  private profileManager: BrowserProfileManager;
  private chromeProcess: ChildProcess | null = null;
  private cdpClient: any | null = null;
  private screencast: ScreencastStream | null = null;
  private inputHandler: InputHandler | null = null;
  private cursorProbe: CursorProbe | null = null;
  private adaptiveQuality: AdaptiveQuality | null = null;
  private frameTimestamps = new Map<number, number>();
  private cdpEndpoint: string | null = null;
  private cdpPort: number | null = null;
  private viewportWidth = 1280;
  private viewportHeight = 720;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs: number;
  private startPromise: Promise<BrowserInfo> | null = null;

  constructor(profileBasePath: string, options?: { idleTimeoutMs?: number }) {
    super();
    this.profileManager = new BrowserProfileManager(profileBasePath);
    this.idleTimeoutMs = options?.idleTimeoutMs ?? 10 * 60 * 1000; // 10 min
  }

  isRunning(): boolean {
    return this.chromeProcess !== null;
  }

  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Blocked navigation to disallowed scheme: ${parsed.protocol}`);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL: ${url}`);
      }
      throw err;
    }
  }

  getCdpPort(): number | null {
    return this.cdpPort;
  }

  getCdpUrl(): string | null {
    return this.cdpPort ? `http://127.0.0.1:${this.cdpPort}` : null;
  }

  async start(projectId: string, options?: BrowserStartPayload): Promise<BrowserInfo> {
    // Already running — return existing info
    if (this.isRunning() && this.cdpPort) {
      return {
        cdpPort: this.cdpPort,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
      };
    }

    // Concurrent start guard — coalesce into single launch
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.doStart(projectId, options);
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async doStart(projectId: string, options?: BrowserStartPayload): Promise<BrowserInfo> {
    const chromePath = await ChromeDetector.detect();
    if (!chromePath) {
      throw new Error('Chrome not found');
    }

    const width = options?.width ?? 1280;
    const height = options?.height ?? 720;
    const quality = options?.quality ?? 70;
    this.viewportWidth = width;
    this.viewportHeight = height;

    const profilePath = await this.profileManager.getProfilePath(projectId);
    await this.profileManager.clearStaleLock(projectId);
    const port = 9222 + Math.floor(Math.random() * 50000);

    const args = [
      '--headless=shell',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profilePath}`,
      '--disable-gpu',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-extensions',
      `--window-size=${width},${height}`,
    ];

    this.chromeProcess = spawn(chromePath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    // Wait for CDP to be ready
    this.cdpEndpoint = await this.waitForCdpEndpoint();
    this.cdpPort = port;

    // Connect CDP
    this.cdpClient = await CDP({ port });
    const { Page, Input, Emulation, Runtime } = this.cdpClient;

    await Page.enable();
    await Emulation.setDeviceMetricsOverride({
      width,
      height,
      deviceScaleFactor: 1,
      mobile: options?.mobile ?? false,
    });

    // Setup screencast
    this.screencast = new ScreencastStream(Page);
    this.screencast.on('frame', (frame: any) => {
      const timestamp = Date.now();
      // Evict oldest entries if map exceeds limit
      if (this.frameTimestamps.size > 1000) {
        const firstKey = this.frameTimestamps.keys().next().value;
        if (firstKey !== undefined) this.frameTimestamps.delete(firstKey);
      }
      this.frameTimestamps.set(timestamp, timestamp);
      this.emit('frame', {
        data: frame.data,
        encoding: 'jpeg' as const,
        timestamp,
        metadata: {
          width: frame.metadata.deviceWidth ?? this.viewportWidth,
          height: frame.metadata.deviceHeight ?? this.viewportHeight,
          pageUrl: '',
          pageTitle: '',
        },
      });
    });
    await this.screencast.start({ quality, maxWidth: width, maxHeight: height });

    // Setup input handler
    this.inputHandler = new InputHandler(Input);
    this.inputHandler.setViewport(width, height);

    // Setup cursor probe
    this.cursorProbe = new CursorProbe(Runtime);

    // Setup adaptive quality
    this.adaptiveQuality = new AdaptiveQuality(quality);

    // Navigate to initial URL if provided
    if (options?.url) {
      this.validateUrl(options.url);
      await Page.navigate({ url: options.url });
    }

    this.cdpClient.on('disconnect', () => {
      // CDP connection lost - clean up state
      this.cdpClient = null;
      this.screencast = null;
      this.emit('error', new Error('CDP connection lost'));
    });

    this.chromeProcess!.on('exit', (code: number | null, signal: string | null) => {
      if (this.chromeProcess) {
        // Chrome crashed at runtime
        this.chromeProcess = null;
        this.screencast = null;
        this.cdpClient = null;
        this.cdpPort = null;
        this.startPromise = null;
        this.clearIdleTimer();
        this.emit('crash', { code, signal });
      }
    });

    return { cdpPort: port, viewportWidth: width, viewportHeight: height };
  }

  detachPreview(): void {
    this.screencast?.stop();
    this.clearIdleTimer();
    this.idleTimer = setTimeout(async () => {
      this.emit('idle-shutdown');
      try {
        await this.stop();
      } catch {
        /* ignore shutdown errors */
      }
    }, this.idleTimeoutMs);
  }

  async attachPreview(): Promise<void> {
    this.clearIdleTimer();
    if (this.screencast && this.isRunning()) {
      await this.screencast.start({ maxWidth: this.viewportWidth, maxHeight: this.viewportHeight });
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  async stop(): Promise<void> {
    this.clearIdleTimer();
    if (this.screencast) {
      try {
        await this.screencast.stop();
      } catch {
        /* CDP may already be dead */
      }
      this.screencast = null;
    }
    if (this.cdpClient) {
      try {
        await this.cdpClient.close();
      } catch {
        /* connection may already be closed */
      }
      this.cdpClient = null;
    }
    if (this.chromeProcess) {
      const proc = this.chromeProcess;
      this.chromeProcess = null; // Clear first to prevent crash handler from firing
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            /* already dead */
          }
          resolve();
        }, 5000);
        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        proc.kill();
      });
    }
    this.cdpEndpoint = null;
    this.cdpPort = null;
    this.inputHandler = null;
    this.cursorProbe = null;
    this.adaptiveQuality = null;
    this.frameTimestamps.clear();
  }

  async navigate(url: string): Promise<void> {
    if (!this.cdpClient) throw new Error('Browser not started');
    this.validateUrl(url);
    await this.cdpClient.Page.navigate({ url });
  }

  async handleInput(input: BrowserInputPayload): Promise<void> {
    if (!this.inputHandler) throw new Error('Browser not started');
    await this.inputHandler.handle(input);

    if (input.type === 'mouseMoved' && this.cursorProbe) {
      const cursor = await this.cursorProbe.probe(input.x ?? 0, input.y ?? 0);
      if (cursor !== null) {
        this.emit('cursor', cursor);
      }
    }
  }

  async ackFrame(timestamp: number): Promise<void> {
    const sentAt = this.frameTimestamps.get(timestamp);
    if (!sentAt || !this.adaptiveQuality || !this.screencast) return;
    this.frameTimestamps.delete(timestamp);

    const latency = Date.now() - sentAt;
    this.adaptiveQuality.recordLatency(latency);

    if (this.adaptiveQuality.shouldRestart()) {
      await this.screencast.setQuality(this.adaptiveQuality.quality);
    }
  }

  async resize(width: number, height: number): Promise<void> {
    if (!this.cdpClient) throw new Error('Browser not started');
    this.viewportWidth = width;
    this.viewportHeight = height;
    await this.cdpClient.Emulation.setDeviceMetricsOverride({
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    if (this.inputHandler) this.inputHandler.setViewport(width, height);
    if (this.screencast) {
      await this.screencast.stop();
      await this.screencast.start({ maxWidth: width, maxHeight: height });
    }
  }

  getCdpEndpoint(): string | null {
    return this.cdpEndpoint;
  }

  private waitForCdpEndpoint(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Chrome CDP'));
      }, 10_000);

      if (!this.chromeProcess?.stderr) {
        clearTimeout(timeout);
        reject(new Error('No stderr on Chrome process'));
        return;
      }

      const onData = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timeout);
          this.chromeProcess?.stderr?.off('data', onData);
          resolve(match[1]);
        }
      };

      this.chromeProcess.stderr.on('data', onData);

      this.chromeProcess.on('exit', (code: number) => {
        clearTimeout(timeout);
        reject(new Error(`Chrome exited with code ${code}`));
      });
    });
  }
}
