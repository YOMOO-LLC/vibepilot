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

  // New tests for OutputDelegate integration

  it('hasSession returns true for existing sessions', () => {
    manager = new PtyManager();
    manager.create('sess-1');
    expect(manager.hasSession('sess-1')).toBe(true);
    expect(manager.hasSession('no-such')).toBe(false);
  });

  it('getPid returns pid for existing sessions', () => {
    manager = new PtyManager();
    const { pid } = manager.create('sess-1');
    expect(manager.getPid('sess-1')).toBe(pid);
    expect(manager.getPid('no-such')).toBeNull();
  });

  it('isExited returns false for live sessions', () => {
    manager = new PtyManager();
    manager.create('sess-1');
    expect(manager.isExited('sess-1')).toBe(false);
    expect(manager.isExited('no-such')).toBe(true);
  });

  it('isExited returns true after exit callback fires', () => {
    manager = new PtyManager();
    manager.create('sess-1');
    manager.onExit('sess-1', () => {});
    manager.destroy('sess-1');
    // After destroy, session is deleted, so isExited returns true (no session)
    expect(manager.isExited('sess-1')).toBe(true);
  });

  it('detachOutput switches to buffering mode', async () => {
    manager = new PtyManager();
    manager.create('sess-1');

    const sink = vi.fn();
    manager.onOutput('sess-1', sink);

    // Write data — goes to sink
    await new Promise<void>((resolve) => {
      sink.mockImplementationOnce(() => resolve());
      manager.write('sess-1', 'first');
    });
    expect(sink).toHaveBeenCalledWith('first');

    // Detach — now data should be buffered
    manager.detachOutput('sess-1');
    sink.mockClear();

    // Write more data — goes to buffer
    manager.write('sess-1', 'second');
    await new Promise(r => setTimeout(r, 20));
    expect(sink).not.toHaveBeenCalled();

    // Attach new sink — should get buffered data
    const sink2 = vi.fn();
    const buffered = manager.attachOutput('sess-1', sink2);
    expect(buffered).toBe('second');
  });

  it('detachOutput is safe for non-existent session', () => {
    manager = new PtyManager();
    expect(() => manager.detachOutput('no-such')).not.toThrow();
  });
});
