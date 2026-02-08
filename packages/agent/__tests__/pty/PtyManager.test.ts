import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { PtyManager } from '../../src/pty/PtyManager.js';

// Mock node-pty since PTY spawning requires real terminal (not available in CI/sandbox)
vi.mock('node-pty', () => {
  const createMockPty = () => {
    const dataCallbacks: Array<(data: string) => void> = [];
    const exitCallbacks: Array<(e: { exitCode: number }) => void> = [];
    let killed = false;

    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      onData: (cb: (data: string) => void) => { dataCallbacks.push(cb); },
      onExit: (cb: (e: { exitCode: number }) => void) => { exitCallbacks.push(cb); },
      write: (data: string) => {
        if (killed) throw new Error('Process killed');
        // Simulate echo back
        setTimeout(() => {
          dataCallbacks.forEach(cb => cb(data));
        }, 5);
      },
      resize: vi.fn(),
      kill: () => {
        killed = true;
        exitCallbacks.forEach(cb => cb({ exitCode: 0 }));
      },
      _dataCallbacks: dataCallbacks,
    };
  };

  return {
    default: { spawn: vi.fn(() => createMockPty()) },
    spawn: vi.fn(() => createMockPty()),
  };
});

describe('PtyManager', () => {
  let manager: PtyManager;

  afterEach(() => {
    manager?.destroyAll();
  });

  it('creates a PTY session and returns pid', () => {
    manager = new PtyManager();
    const { pid } = manager.create('sess-1');
    expect(pid).toBeGreaterThan(0);
  });

  it('writing data triggers output event', async () => {
    manager = new PtyManager();
    manager.create('sess-1', { cols: 80, rows: 24 });

    const output = await new Promise<string>((resolve) => {
      manager.onOutput('sess-1', (data) => {
        resolve(data);
      });
      manager.write('sess-1', 'echo hello-pty-test\r');
    });

    expect(output).toContain('echo hello-pty-test');
  });

  it('resize changes terminal dimensions', () => {
    manager = new PtyManager();
    manager.create('sess-1', { cols: 80, rows: 24 });

    expect(() => manager.resize('sess-1', 120, 40)).not.toThrow();
  });

  it('destroy cleans up a session', () => {
    manager = new PtyManager();
    manager.create('sess-1');

    manager.destroy('sess-1');

    expect(() => manager.write('sess-1', 'test')).toThrow();
  });

  it('destroyAll cleans up all sessions', () => {
    manager = new PtyManager();
    manager.create('sess-1');
    manager.create('sess-2');

    manager.destroyAll();

    expect(() => manager.write('sess-1', 'test')).toThrow();
    expect(() => manager.write('sess-2', 'test')).toThrow();
  });

  it('handles non-existent sessionId safely', () => {
    manager = new PtyManager();

    expect(() => manager.write('no-such', 'test')).toThrow('Session not found: no-such');
    expect(() => manager.resize('no-such', 80, 24)).toThrow('Session not found: no-such');
    expect(() => manager.destroy('no-such')).not.toThrow();
  });

  it('create with custom cwd and shell', () => {
    manager = new PtyManager();
    const { pid } = manager.create('sess-1', {
      cols: 80,
      rows: 24,
      cwd: '/tmp',
      shell: '/bin/sh',
    });
    expect(pid).toBeGreaterThan(0);
  });

  it('registers exit callback', () => {
    manager = new PtyManager();
    manager.create('sess-1');

    const exitFn = vi.fn();
    manager.onExit('sess-1', exitFn);

    manager.destroy('sess-1');
    expect(exitFn).toHaveBeenCalledWith(0);
  });
});
