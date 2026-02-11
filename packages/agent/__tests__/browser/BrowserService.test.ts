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
});
