import { PtyManager } from './PtyManager.js';

export interface OrphanedSession {
  sessionId: string;
  lastCwd: string;
  orphanedAt: number;
}

export interface SessionPersistenceOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class SessionPersistenceManager {
  private orphans = new Map<string, OrphanedSession>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private ptyManager: PtyManager;
  private timeoutMs: number;
  private onExpire?: (sessionId: string) => void;

  constructor(
    ptyManager: PtyManager,
    options: SessionPersistenceOptions = {}
  ) {
    this.ptyManager = ptyManager;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Register a callback for when an orphaned session expires */
  setOnExpire(cb: (sessionId: string) => void): void {
    this.onExpire = cb;
  }

  /** Mark a session as orphaned (client disconnected) */
  orphan(sessionId: string, lastCwd: string): void {
    if (this.orphans.has(sessionId)) return;

    const orphaned: OrphanedSession = {
      sessionId,
      lastCwd,
      orphanedAt: Date.now(),
    };

    this.orphans.set(sessionId, orphaned);

    // Start expiration timer
    const timer = setTimeout(() => {
      this.expire(sessionId);
    }, this.timeoutMs);

    this.timers.set(sessionId, timer);
  }

  /** Reclaim an orphaned session (client reconnected) */
  reclaim(sessionId: string): OrphanedSession | null {
    const orphan = this.orphans.get(sessionId);
    if (!orphan) return null;

    // Cancel expiration timer
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }

    this.orphans.delete(sessionId);
    return orphan;
  }

  isOrphaned(sessionId: string): boolean {
    return this.orphans.has(sessionId);
  }

  /** Handle PTY exit during orphaned state */
  handleOrphanedExit(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
    this.orphans.delete(sessionId);
  }

  /** Destroy all orphaned sessions */
  destroyAll(): void {
    for (const [sessionId, timer] of this.timers) {
      clearTimeout(timer);
      this.ptyManager.destroy(sessionId);
    }
    this.timers.clear();
    this.orphans.clear();
  }

  private expire(sessionId: string): void {
    this.timers.delete(sessionId);
    this.orphans.delete(sessionId);
    this.ptyManager.destroy(sessionId);
    this.onExpire?.(sessionId);
  }
}
