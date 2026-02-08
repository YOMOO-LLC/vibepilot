import { describe, it, expect, vi } from 'vitest';
import { program } from '../../bin/vibepilot.js';

// Mock the WS server to avoid starting real servers
vi.mock('../../src/transport/WebSocketServer.js', () => ({
  VPWebSocketServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('node-pty', () => ({
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));

describe('CLI', () => {
  it('has serve command', () => {
    const serveCmd = program.commands.find(c => c.name() === 'serve');
    expect(serveCmd).toBeDefined();
  });

  it('has init command', () => {
    const initCmd = program.commands.find(c => c.name() === 'init');
    expect(initCmd).toBeDefined();
  });

  it('serve command has port option', () => {
    const serveCmd = program.commands.find(c => c.name() === 'serve');
    const portOpt = serveCmd!.options.find(o => o.long === '--port');
    expect(portOpt).toBeDefined();
  });

  it('serve command has dir option', () => {
    const serveCmd = program.commands.find(c => c.name() === 'serve');
    const dirOpt = serveCmd!.options.find(o => o.long === '--dir');
    expect(dirOpt).toBeDefined();
  });

  it('has version', () => {
    expect(program.version()).toBe('0.1.0');
  });
});
