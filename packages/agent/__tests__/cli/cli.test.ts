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

vi.mock('../../src/cli/setupWizard.js', () => ({
  runSetupWizard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/cli/configCommand.js', () => ({
  configMain: vi.fn().mockResolvedValue(undefined),
  configAuth: vi.fn().mockResolvedValue(undefined),
  configServer: vi.fn().mockResolvedValue(undefined),
  configProjects: vi.fn().mockResolvedValue(undefined),
}));

describe('CLI', () => {
  it('has serve command', () => {
    const serveCmd = program.commands.find((c) => c.name() === 'serve');
    expect(serveCmd).toBeDefined();
  });

  it('does not have init command', () => {
    const initCmd = program.commands.find((c) => c.name() === 'init');
    expect(initCmd).toBeUndefined();
  });

  it('serve command has port option', () => {
    const serveCmd = program.commands.find((c) => c.name() === 'serve');
    const portOpt = serveCmd!.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
  });

  it('serve command has dir option', () => {
    const serveCmd = program.commands.find((c) => c.name() === 'serve');
    const dirOpt = serveCmd!.options.find((o) => o.long === '--dir');
    expect(dirOpt).toBeDefined();
  });

  it('has version', () => {
    expect(program.version()).toBe('0.1.0');
  });

  // ── Auth commands (colon-style) ──────────────────────────────
  it('has auth:login command', () => {
    const cmd = program.commands.find((c) => c.name() === 'auth:login');
    expect(cmd).toBeDefined();
  });

  it('has auth:logout command', () => {
    const cmd = program.commands.find((c) => c.name() === 'auth:logout');
    expect(cmd).toBeDefined();
  });

  it('has auth:status command', () => {
    const cmd = program.commands.find((c) => c.name() === 'auth:status');
    expect(cmd).toBeDefined();
  });

  it('does not have auth group command', () => {
    const authGroup = program.commands.find((c) => c.name() === 'auth');
    // 'auth' should not exist as a parent group
    expect(authGroup).toBeUndefined();
  });

  // ── Project commands ─────────────────────────────────────────
  it('has project:add command', () => {
    const cmd = program.commands.find((c) => c.name() === 'project:add');
    expect(cmd).toBeDefined();
  });

  it('has project:list command', () => {
    const cmd = program.commands.find((c) => c.name() === 'project:list');
    expect(cmd).toBeDefined();
  });

  it('has project:remove command', () => {
    const cmd = program.commands.find((c) => c.name() === 'project:remove');
    expect(cmd).toBeDefined();
  });

  // ── Config commands ──────────────────────────────────────────
  it('has config command', () => {
    const cmd = program.commands.find((c) => c.name() === 'config');
    expect(cmd).toBeDefined();
  });

  it('has config:auth command', () => {
    const cmd = program.commands.find((c) => c.name() === 'config:auth');
    expect(cmd).toBeDefined();
  });

  it('has config:server command', () => {
    const cmd = program.commands.find((c) => c.name() === 'config:server');
    expect(cmd).toBeDefined();
  });

  it('has config:projects command', () => {
    const cmd = program.commands.find((c) => c.name() === 'config:projects');
    expect(cmd).toBeDefined();
  });
});
