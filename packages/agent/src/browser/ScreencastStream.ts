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
  off(event: string, handler: (...args: any[]) => void): void;
}

export class ScreencastStream extends EventEmitter {
  private cdpPage: CDPPage;
  private running = false;
  private frameHandler: ((params: any) => void) | null = null;

  constructor(cdpPage: CDPPage) {
    super();
    this.cdpPage = cdpPage;
  }

  async start(options?: ScreencastOptions): Promise<void> {
    this.running = true;
    const quality = options?.quality ?? 70;
    const maxWidth = options?.maxWidth ?? 1280;
    const maxHeight = options?.maxHeight ?? 720;

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
      this.cdpPage.off('screencastFrame', this.frameHandler);
      this.frameHandler = null;
    }
    await this.cdpPage.stopScreencast();
  }
}
