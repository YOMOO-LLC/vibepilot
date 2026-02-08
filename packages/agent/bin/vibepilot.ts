#!/usr/bin/env node
import { Command } from 'commander';
import { VPWebSocketServer } from '../src/transport/WebSocketServer.js';
import { DEFAULT_PORT } from '@vibepilot/protocol';

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
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    const cwd = opts.dir;

    const server = new VPWebSocketServer({ port, cwd });
    await server.start();

    console.log(`VibePilot Agent listening on ws://localhost:${port}`);
    console.log(`Working directory: ${cwd}`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
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
    console.log('VibePilot initialized in', process.cwd());
  });

export { program };

// Only parse if run directly (not imported for testing)
const arg1 = process.argv[1] || '';
const isDirectRun = arg1.endsWith('vibepilot.js') || arg1.endsWith('vibepilot.ts');
if (isDirectRun) {
  program.parse();
}
