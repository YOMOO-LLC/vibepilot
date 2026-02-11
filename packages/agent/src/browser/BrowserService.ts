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

  constructor(profileBasePath: string) {
    super();
    this.profileManager = new BrowserProfileManager(profileBasePath);
  }

  async start(projectId: string, options?: BrowserStartPayload): Promise<BrowserInfo> {
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
    const port = 9222 + Math.floor(Math.random() * 1000);

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
      await Page.navigate({ url: options.url });
    }

    return { cdpPort: port, viewportWidth: width, viewportHeight: height };
  }

  async stop(): Promise<void> {
    if (this.screencast) {
      await this.screencast.stop();
      this.screencast = null;
    }
    if (this.cdpClient) {
      await this.cdpClient.close();
      this.cdpClient = null;
    }
    if (this.chromeProcess) {
      this.chromeProcess.kill();
      this.chromeProcess = null;
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
