#!/usr/bin/env node
import { Command } from 'commander';
import { VPWebSocketServer } from '../src/transport/WebSocketServer.js';
import { DEFAULT_PORT } from '@vibepilot/protocol';
import { logger } from '../src/utils/logger.js';

const program = new Command();

program
  .name('vibepilot')
  .description('VibePilot Agent - local development bridge')
  .version('0.1.0');

program
  .command('serve')
  .description('Start the VibePilot agent server')
  .option('-p, --port <number>', 'WebSocket server port', String(DEFAULT_PORT))
  .option('-d, --dir <path>', 'Working directory', process.cwd())
  .option('-t, --session-timeout <seconds>', 'PTY session timeout after disconnect (seconds)', '300')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    const cwd = opts.dir;
    const sessionTimeoutMs = parseInt(opts.sessionTimeout, 10) * 1000;

    const server = new VPWebSocketServer({ port, cwd, sessionTimeoutMs });
    await server.start();

    logger.info(
      {
        port,
        cwd,
        sessionTimeout: `${sessionTimeoutMs / 1000}s`,
      },
      'VibePilot Agent started',
    );

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('init')
  .description('Initialize VibePilot in the current project')
  .action(() => {
    logger.info({ cwd: process.cwd() }, 'VibePilot initialized');
  });

export { program };

// Only parse if run directly (not imported for testing)
const arg1 = process.argv[1] || '';
const isDirectRun = arg1.endsWith('vibepilot.js') || arg1.endsWith('vibepilot.ts');
if (isDirectRun) {
  program.parse();
}
