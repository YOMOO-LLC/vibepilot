import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Use vi.hoisted so mock variables are available inside vi.mock factories.
// Cannot use EventEmitter here because imports are not available in hoisted scope.
const { mockCDPClient, mockCDP, mockDetect, mockSpawn } = vi.hoisted(() => {
  const mockCDPClient = {
    Page: {
      enable: vi.fn().mockResolvedValue(undefined),
      startScreencast: vi.fn().mockResolvedValue(undefined),
      stopScreencast: vi.fn().mockResolvedValue(undefined),
      screencastFrameAck: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    },
    Input: {
      dispatchMouseEvent: vi.fn().mockResolvedValue(undefined),
      dispatchKeyEvent: vi.fn().mockResolvedValue(undefined),
      insertText: vi.fn().mockResolvedValue(undefined),
    },
    Emulation: {
      setDeviceMetricsOverride: vi.fn().mockResolvedValue(undefined),
    },
    Runtime: {
      evaluate: vi.fn().mockResolvedValue({ result: { value: 'default' } }),
    },
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };

  const mockCDP = vi.fn().mockResolvedValue(mockCDPClient);
  const mockDetect = vi.fn().mockResolvedValue('/usr/bin/google-chrome');
  const mockSpawn = vi.fn();

  return { mockCDPClient, mockCDP, mockDetect, mockSpawn };
});

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('chrome-remote-interface', () => ({
  default: mockCDP,
}));

vi.mock('../../src/browser/ChromeDetector.js', () => ({
  ChromeDetector: {
    detect: mockDetect,
  },
}));

import { BrowserService } from '../../src/browser/BrowserService.js';

describe('BrowserService', () => {
  let service: BrowserService;
  let tmpDir: string;
  let mockChildProcess: any;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bs-test-'));
    vi.clearAllMocks();

    // Create a fresh EventEmitter-based mock child process for each test
    mockChildProcess = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      pid: 12345,
      stderr: new EventEmitter(),
    });
    mockSpawn.mockReturnValue(mockChildProcess);

    mockCDP.mockResolvedValue(mockCDPClient);
    mockDetect.mockResolvedValue('/usr/bin/google-chrome');

    service = new BrowserService(tmpDir);
  });

  afterEach(async () => {
    try {
      await service.stop();
    } catch {}
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('starts Chrome and connects CDP', async () => {
    const startPromise = service.start('project-1');

    // Simulate Chrome stderr output indicating ready
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);

    const info = await startPromise;
    expect(info.cdpPort).toBeDefined();
    expect(info.viewportWidth).toBe(1280);
    expect(info.viewportHeight).toBe(720);
  });

  it('emits error when Chrome not found', async () => {
    mockDetect.mockResolvedValueOnce(null);

    await expect(service.start('project-1')).rejects.toThrow('Chrome not found');
  });

  it('stops Chrome process on stop()', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    await service.stop();
    expect(mockChildProcess.kill).toHaveBeenCalled();
  });

  it('navigates to a URL', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    await service.navigate('http://localhost:3000');
    expect(mockCDPClient.Page.navigate).toHaveBeenCalledWith({ url: 'http://localhost:3000' });
  });

  it('forwards input events', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    await service.handleInput({
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });
    expect(mockCDPClient.Input.dispatchMouseEvent).toHaveBeenCalled();
  });

  it('returns CDP endpoint after start', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    const endpoint = service.getCdpEndpoint();
    expect(endpoint).toContain('ws://');
  });

  it('returns null endpoint when not started', () => {
    expect(service.getCdpEndpoint()).toBeNull();
  });

  it('emits cursor on mouseMoved input', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    const cursorSpy = vi.fn();
    service.on('cursor', cursorSpy);

    await service.handleInput({ type: 'mouseMoved', x: 100, y: 200 });

    expect(mockCDPClient.Runtime.evaluate).toHaveBeenCalled();
    expect(cursorSpy).toHaveBeenCalledWith('default');
  });

  it('isRunning() returns false before start', () => {
    expect(service.isRunning()).toBe(false);
  });

  it('isRunning() returns true after start', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    expect(service.isRunning()).toBe(true);
  });

  it('isRunning() returns false after stop', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    await service.stop();
    expect(service.isRunning()).toBe(false);
  });

  it('double start reuses existing Chrome (spawn called once)', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    const info1 = await startPromise;

    const info2 = await service.start('project-1');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(info2.cdpPort).toBe(info1.cdpPort);
    expect(info2.viewportWidth).toBe(info1.viewportWidth);
    expect(info2.viewportHeight).toBe(info1.viewportHeight);
  });

  it('getCdpPort() returns port after start', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    expect(service.getCdpPort()).toBeTypeOf('number');
  });

  it('getCdpPort() returns null when not started', () => {
    expect(service.getCdpPort()).toBeNull();
  });

  it('does not emit cursor on non-mouseMoved input', async () => {
    const startPromise = service.start('project-1');
    setTimeout(() => {
      mockChildProcess.stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
      );
    }, 10);
    await startPromise;

    const cursorSpy = vi.fn();
    service.on('cursor', cursorSpy);

    await service.handleInput({
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });

    expect(mockCDPClient.Runtime.evaluate).not.toHaveBeenCalled();
    expect(cursorSpy).not.toHaveBeenCalled();
  });

  describe('URL validation', () => {
    it('rejects file:// scheme navigation', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      await expect(service.navigate('file:///etc/passwd')).rejects.toThrow(
        'Blocked navigation to disallowed scheme'
      );
    });

    it('rejects javascript: scheme navigation', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      await expect(service.navigate('javascript:alert(1)')).rejects.toThrow(
        'Blocked navigation to disallowed scheme'
      );
    });

    it('allows http:// and https:// navigation', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      await service.navigate('http://localhost:3000');
      await service.navigate('https://example.com');
      expect(mockCDPClient.Page.navigate).toHaveBeenCalledTimes(2);
    });
  });

  describe('Chrome crash detection', () => {
    it('emits crash event when Chrome exits unexpectedly', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      const crashSpy = vi.fn();
      service.on('crash', crashSpy);

      // Simulate Chrome crash
      mockChildProcess.emit('exit', 1, null);

      expect(crashSpy).toHaveBeenCalledWith({ code: 1, signal: null });
      expect(service.isRunning()).toBe(false);
      expect(service.getCdpPort()).toBeNull();
    });

    it('emits error event when CDP disconnects', async () => {
      // Track the disconnect handler registered on the CDP client
      let disconnectHandler: (() => void) | null = null;
      mockCDPClient.on.mockImplementation((event: string, handler: () => void) => {
        if (event === 'disconnect') {
          disconnectHandler = handler;
        }
      });

      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      const errorSpy = vi.fn();
      service.on('error', errorSpy);

      // Simulate CDP disconnect
      expect(disconnectHandler).not.toBeNull();
      disconnectHandler!();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'CDP connection lost' })
      );
    });
  });

  describe('concurrent start guard', () => {
    it('coalesces simultaneous start calls into single launch', async () => {
      // Start two calls concurrently before Chrome is ready
      const promise1 = service.start('project-1');
      const promise2 = service.start('project-1');

      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);

      const [info1, info2] = await Promise.all([promise1, promise2]);

      // Only one Chrome process should be spawned
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(info1.cdpPort).toBe(info2.cdpPort);
    });
  });

  describe('ackFrame and adaptive quality', () => {
    it('ackFrame records latency without error', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      // ackFrame with unknown timestamp should be a no-op
      await service.ackFrame(99999);
      // Should not throw
    });
  });

  describe('resize', () => {
    it('updates viewport dimensions', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      await service.resize(1920, 1080);

      expect(mockCDPClient.Emulation.setDeviceMetricsOverride).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1920, height: 1080 })
      );
    });

    it('throws when browser not started', async () => {
      await expect(service.resize(1920, 1080)).rejects.toThrow('Browser not started');
    });
  });

  describe('resilient stop', () => {
    it('completes cleanup even when screencast.stop() throws', async () => {
      const startPromise = service.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      // Make screencast stop throw
      mockCDPClient.Page.stopScreencast.mockRejectedValueOnce(new Error('CDP dead'));

      // stop() should still complete without throwing
      await service.stop();
      expect(mockChildProcess.kill).toHaveBeenCalled();
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('idle timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('detachPreview() triggers idle-shutdown after timeout', async () => {
      vi.useRealTimers();
      const shortTimeoutService = new BrowserService(tmpDir, { idleTimeoutMs: 100 });

      const startPromise = shortTimeoutService.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      const shutdownSpy = vi.fn();
      shortTimeoutService.on('idle-shutdown', shutdownSpy);
      shortTimeoutService.detachPreview();

      await new Promise((r) => setTimeout(r, 200));

      expect(shutdownSpy).toHaveBeenCalled();
      expect(shortTimeoutService.isRunning()).toBe(false);
    });

    it('attachPreview() cancels idle timer, Chrome keeps running', async () => {
      vi.useRealTimers();
      const shortTimeoutService = new BrowserService(tmpDir, { idleTimeoutMs: 200 });

      const startPromise = shortTimeoutService.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      const shutdownSpy = vi.fn();
      shortTimeoutService.on('idle-shutdown', shutdownSpy);
      shortTimeoutService.detachPreview();

      await new Promise((r) => setTimeout(r, 50));
      shortTimeoutService.attachPreview();

      await new Promise((r) => setTimeout(r, 300));

      expect(shutdownSpy).not.toHaveBeenCalled();
      expect(shortTimeoutService.isRunning()).toBe(true);

      await shortTimeoutService.stop();
    });

    it('stop() clears idle timer', async () => {
      vi.useRealTimers();
      const shortTimeoutService = new BrowserService(tmpDir, { idleTimeoutMs: 200 });

      const startPromise = shortTimeoutService.start('project-1');
      setTimeout(() => {
        mockChildProcess.stderr.emit(
          'data',
          Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n')
        );
      }, 10);
      await startPromise;

      const shutdownSpy = vi.fn();
      shortTimeoutService.on('idle-shutdown', shutdownSpy);
      shortTimeoutService.detachPreview();

      await shortTimeoutService.stop();

      await new Promise((r) => setTimeout(r, 300));

      // idle-shutdown should NOT fire after explicit stop
      expect(shutdownSpy).not.toHaveBeenCalled();
    });
  });
});
