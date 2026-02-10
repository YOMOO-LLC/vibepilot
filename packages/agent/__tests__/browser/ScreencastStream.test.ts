import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreencastStream } from '../../src/browser/ScreencastStream.js';

describe('ScreencastStream', () => {
  let mockPage: {
    startScreencast: ReturnType<typeof vi.fn>;
    stopScreencast: ReturnType<typeof vi.fn>;
    screencastFrameAck: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  let stream: ScreencastStream;

  beforeEach(() => {
    mockPage = {
      startScreencast: vi.fn().mockResolvedValue(undefined),
      stopScreencast: vi.fn().mockResolvedValue(undefined),
      screencastFrameAck: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    };
    stream = new ScreencastStream(mockPage as any);
  });

  it('starts screencast with default options', async () => {
    await stream.start();

    expect(mockPage.startScreencast).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 70,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    });
    expect(mockPage.on).toHaveBeenCalledWith('screencastFrame', expect.any(Function));
  });

  it('starts screencast with custom options', async () => {
    await stream.start({ quality: 50, maxWidth: 1920, maxHeight: 1080 });

    expect(mockPage.startScreencast).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 50,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1,
    });
  });

  it('emits frame events and acks', async () => {
    const frameHandler = vi.fn();
    stream.on('frame', frameHandler);

    await stream.start();

    // Simulate CDP frame event
    const frameCallback = mockPage.on.mock.calls[0][1];
    frameCallback({
      data: 'base64data',
      metadata: {
        offsetTop: 0,
        pageScaleFactor: 1,
        deviceWidth: 1280,
        deviceHeight: 720,
      },
      sessionId: 42,
    });

    expect(frameHandler).toHaveBeenCalledWith({
      data: 'base64data',
      metadata: expect.objectContaining({
        deviceWidth: 1280,
        deviceHeight: 720,
      }),
    });
    expect(mockPage.screencastFrameAck).toHaveBeenCalledWith({ sessionId: 42 });
  });

  it('stops screencast', async () => {
    await stream.start();
    await stream.stop();

    expect(mockPage.stopScreencast).toHaveBeenCalled();
    expect(mockPage.off).toHaveBeenCalledWith('screencastFrame', expect.any(Function));
  });

  it('does not ack after stopped', async () => {
    await stream.start();
    const frameCallback = mockPage.on.mock.calls[0][1];
    await stream.stop();

    frameCallback({ data: 'late-frame', metadata: {}, sessionId: 99 });

    // Should not ack after stop
    expect(mockPage.screencastFrameAck).not.toHaveBeenCalledWith({ sessionId: 99 });
  });
});
