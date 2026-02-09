import * as pty from 'node-pty';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OutputDelegate, type OutputSink } from './OutputDelegate.js';

const execAsync = promisify(exec);

const ALLOWED_SHELLS = new Set([
  '/bin/bash',
  '/bin/zsh',
  '/bin/sh',
  '/usr/bin/bash',
  '/usr/bin/zsh',
  '/usr/local/bin/bash',
  '/usr/local/bin/zsh',
]);

export interface PtyCreateOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
}

interface PtySession {
  process: pty.IPty;
  pid: number;
  outputDelegate: OutputDelegate;
  exited: boolean;
  exitCode?: number;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  create(sessionId: string, options: PtyCreateOptions = {}): { pid: number } {
    const {
      cols = 80,
      rows = 24,
      cwd = process.cwd(),
      shell = process.env.SHELL || '/bin/bash',
    } = options;

    if (!ALLOWED_SHELLS.has(shell)) {
      throw new Error('Shell not allowed');
    }

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    const outputDelegate = new OutputDelegate();

    // Register the ONE permanent onData listener
    proc.onData(outputDelegate.handler);

    this.sessions.set(sessionId, {
      process: proc,
      pid: proc.pid,
      outputDelegate,
      exited: false,
    });

    return { pid: proc.pid };
  }

  write(sessionId: string, data: string): void {
    const session = this.getSession(sessionId);
    session.process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.getSession(sessionId);
    session.process.resize(cols, rows);
  }

  /** Legacy: attach output callback via delegate */
  onOutput(sessionId: string, callback: (data: string) => void): void {
    const session = this.getSession(sessionId);
    session.outputDelegate.attach(callback);
  }

  onExit(sessionId: string, callback: (exitCode: number) => void): void {
    const session = this.getSession(sessionId);
    session.process.onExit(({ exitCode }) => {
      session.exited = true;
      session.exitCode = exitCode;
      callback(exitCode);
    });
  }

  /** Detach the output sink (output will be buffered) */
  detachOutput(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.outputDelegate.detach();
  }

  /** Attach a new output sink, returns any buffered output */
  attachOutput(sessionId: string, callback: OutputSink): string {
    const session = this.getSession(sessionId);
    return session.outputDelegate.attach(callback);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  isExited(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.exited : true;
  }

  getPid(sessionId: string): number | null {
    const session = this.sessions.get(sessionId);
    return session ? session.pid : null;
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return; // safe no-op for non-existent session
    session.process.kill();
    this.sessions.delete(sessionId);
  }

  destroyAll(): void {
    for (const [id] of this.sessions) {
      this.destroy(id);
    }
  }

  async getCwd(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    try {
      if (process.platform === 'darwin') {
        const { stdout } = await execAsync(
          `lsof -a -p ${session.pid} -d cwd -Fn 2>/dev/null | grep ^n | cut -c2-`
        );
        return stdout.trim() || null;
      } else {
        const { stdout } = await execAsync(`readlink /proc/${session.pid}/cwd`);
        return stdout.trim() || null;
      }
    } catch {
      return null;
    }
  }

  private getSession(sessionId: string): PtySession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }
}
