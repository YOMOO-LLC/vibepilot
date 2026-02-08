import * as pty from 'node-pty';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PtyCreateOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
}

interface PtySession {
  process: pty.IPty;
  pid: number;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  create(
    sessionId: string,
    options: PtyCreateOptions = {}
  ): { pid: number } {
    const {
      cols = 80,
      rows = 24,
      cwd = process.cwd(),
      shell = process.env.SHELL || '/bin/bash',
    } = options;

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    this.sessions.set(sessionId, {
      process: proc,
      pid: proc.pid,
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

  onOutput(
    sessionId: string,
    callback: (data: string) => void
  ): void {
    const session = this.getSession(sessionId);
    session.process.onData(callback);
  }

  onExit(
    sessionId: string,
    callback: (exitCode: number) => void
  ): void {
    const session = this.getSession(sessionId);
    session.process.onExit(({ exitCode }) => {
      callback(exitCode);
    });
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
