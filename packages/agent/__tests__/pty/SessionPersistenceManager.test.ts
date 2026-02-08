import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionPersistenceManager } from '../../src/pty/SessionPersistenceManager.js';
import { PtyManager } from '../../src/pty/PtyManager.js';

// Mock PtyManager
vi.mock('../../src/pty/PtyManager.js', () => {
  return {
    PtyManager: vi.fn().mockImplementation(() => ({
      destroy: vi.fn(),
      hasSession: vi.fn().mockReturnValue(true),
      isExited: vi.fn().mockReturnValue(false),
    })),
  };
});

describe('SessionPersistenceManager', () => {
  let ptyManager: any;
  let manager: SessionPersistenceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    ptyManager = new PtyManager();
    manager = new SessionPersistenceManager(ptyManager, { timeoutMs: 5000 });
  });

  afterEach(() => {
    manager.destroyAll();
    vi.useRealTimers();
  });

  it('orphans a session', () => {
    manager.orphan('sess-1', '/home/user');
    expect(manager.isOrphaned('sess-1')).toBe(true);
  });

  it('reclaims an orphaned session', () => {
    manager.orphan('sess-1', '/home/user');
    const result = manager.reclaim('sess-1');

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-1');
    expect(result!.lastCwd).toBe('/home/user');
    expect(manager.isOrphaned('sess-1')).toBe(false);
  });

  it('reclaim returns null for non-orphaned session', () => {
    expect(manager.reclaim('no-such')).toBeNull();
  });

  it('destroys PTY after timeout', () => {
    manager.orphan('sess-1', '/home/user');

    vi.advanceTimersByTime(4999);
    expect(ptyManager.destroy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(ptyManager.destroy).toHaveBeenCalledWith('sess-1');
    expect(manager.isOrphaned('sess-1')).toBe(false);
  });

  it('cancels timeout on reclaim', () => {
    manager.orphan('sess-1', '/home/user');
    manager.reclaim('sess-1');

    vi.advanceTimersByTime(10000);
    expect(ptyManager.destroy).not.toHaveBeenCalled();
  });

  it('calls onExpire callback on timeout', () => {
    const onExpire = vi.fn();
    manager.setOnExpire(onExpire);
    manager.orphan('sess-1', '/home/user');

    vi.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledWith('sess-1');
  });

  it('handleOrphanedExit cleans up', () => {
    manager.orphan('sess-1', '/home/user');
    manager.handleOrphanedExit('sess-1');

    expect(manager.isOrphaned('sess-1')).toBe(false);

    // Timer should be cancelled — no destroy on timeout
    vi.advanceTimersByTime(10000);
    expect(ptyManager.destroy).not.toHaveBeenCalled();
  });

  it('orphan is idempotent', () => {
    manager.orphan('sess-1', '/home/user');
    manager.orphan('sess-1', '/other/path');

    // Should still have original data
    const result = manager.reclaim('sess-1');
    expect(result!.lastCwd).toBe('/home/user');
  });

  it('destroyAll cleans up all sessions', () => {
    manager.orphan('sess-1', '/a');
    manager.orphan('sess-2', '/b');

    manager.destroyAll();

    expect(manager.isOrphaned('sess-1')).toBe(false);
    expect(manager.isOrphaned('sess-2')).toBe(false);
    expect(ptyManager.destroy).toHaveBeenCalledWith('sess-1');
    expect(ptyManager.destroy).toHaveBeenCalledWith('sess-2');
  });
});
