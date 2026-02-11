import { EventEmitter } from 'events';

interface ScreencastOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

interface CDPPage {
  startScreencast(params: Record<string, unknown>): Promise<void>;
  stopScreencast(): Promise<void>;
  screencastFrameAck(params: { sessionId: number }): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
  off?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
}

export class ScreencastStream extends EventEmitter {
  private cdpPage: CDPPage;
  private running = false;
  private frameHandler: ((params: any) => void) | null = null;
  private lastOptions: ScreencastOptions = {};

  constructor(cdpPage: CDPPage) {
    super();
    this.cdpPage = cdpPage;
  }

  async start(options?: ScreencastOptions): Promise<void> {
    this.running = true;
    if (options) this.lastOptions = { ...this.lastOptions, ...options };
    const quality = this.lastOptions.quality ?? 70;
    const maxWidth = this.lastOptions.maxWidth ?? 1280;
    const maxHeight = this.lastOptions.maxHeight ?? 720;

    this.frameHandler = (params: any) => {
      if (!this.running) return;
      this.emit('frame', {
        data: params.data,
        metadata: params.metadata,
      });
      this.cdpPage.screencastFrameAck({ sessionId: params.sessionId });
    };

    this.cdpPage.on('screencastFrame', this.frameHandler);

    await this.cdpPage.startScreencast({
      format: 'jpeg',
      quality,
      maxWidth,
      maxHeight,
      everyNthFrame: 1,
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandler) {
      const remove = this.cdpPage.off ?? this.cdpPage.removeListener;
      remove?.call(this.cdpPage, 'screencastFrame', this.frameHandler);
      this.frameHandler = null;
    }
    await this.cdpPage.stopScreencast();
  }

  async setQuality(quality: number): Promise<void> {
    await this.stop();
    await this.start({ quality });
  }
}
