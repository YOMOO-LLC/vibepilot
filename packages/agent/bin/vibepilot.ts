#!/usr/bin/env node
import { Command } from 'commander';
import * as os from 'os';
import { VPWebSocketServer } from '../src/transport/WebSocketServer.js';
import { DEFAULT_PORT } from '@vibepilot/protocol';
import { logger } from '../src/utils/logger.js';
import { ProjectManager } from '../src/config/ProjectManager.js';
import { TokenAuthProvider } from '../src/auth/TokenAuthProvider.js';
import { SupabaseAuthProvider } from '../src/auth/SupabaseAuthProvider.js';
import { FileSystemRegistry } from '../src/registry/FileSystemRegistry.js';
import { SupabaseRegistry } from '../src/registry/SupabaseRegistry.js';
import type { AuthProvider } from '../src/auth/AuthProvider.js';
import type { AgentRegistry } from '../src/registry/AgentRegistry.js';

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
  .option(
    '-t, --session-timeout <seconds>',
    'PTY session timeout after disconnect (seconds)',
    '300'
  )
  .option('--token <token>', 'Authentication token (enables token auth mode)')
  .option('--agent-name <name>', 'Agent display name', os.hostname())
  .option('--public-url <url>', 'Agent public WebSocket URL')
  .option('--registry-path <path>', 'Path to agent registry file')
  .option('--supabase-url <url>', 'Supabase project URL (enables Supabase auth mode)')
  .option('--supabase-key <key>', 'Supabase service role key')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    const cwd = opts.dir;
    const sessionTimeoutMs = parseInt(opts.sessionTimeout, 10) * 1000;

    // Determine auth mode: supabase > token > none
    const supabaseUrl = opts.supabaseUrl || process.env.VP_SUPABASE_URL;
    const supabaseKey = opts.supabaseKey || process.env.VP_SUPABASE_KEY;

    // Initialize auth provider
    let authProvider: AuthProvider | undefined;
    if (supabaseUrl) {
      authProvider = new SupabaseAuthProvider(supabaseUrl);
      logger.info('Supabase authentication enabled');
    } else {
      const token = opts.token || process.env.VP_TOKEN;
      if (token) {
        authProvider = new TokenAuthProvider(token);
        logger.info('Token authentication enabled');
      }
    }

    // Initialize agent registry
    let registry: AgentRegistry | undefined;
    const publicUrl = opts.publicUrl || process.env.VP_PUBLIC_URL;
    const agentName = opts.agentName || process.env.VP_AGENT_NAME || os.hostname();

    if (supabaseUrl && supabaseKey) {
      // Supabase registry mode
      registry = new SupabaseRegistry(supabaseUrl, supabaseKey);
      const effectivePublicUrl = publicUrl || `wss://localhost:${port}`;

      const agentInfo = await registry.register({
        name: agentName,
        publicUrl: effectivePublicUrl,
        ownerId: 'supabase', // Will be replaced by actual user ID via RLS
        version: '0.1.0',
        platform: `${os.platform()}-${os.arch()}`,
      });
      logger.info({ agentId: agentInfo.id, name: agentInfo.name }, 'Agent registered (Supabase)');
    } else {
      // File-system registry mode (single-user / token mode)
      const registryPath = opts.registryPath || process.env.VP_REGISTRY_PATH;
      if (registryPath || publicUrl) {
        const path = registryPath || `${os.homedir()}/.vibepilot/agents.json`;
        registry = new FileSystemRegistry(path);

        const effectivePublicUrl = publicUrl || `ws://localhost:${port}`;

        const agentInfo = await registry.register({
          name: agentName,
          publicUrl: effectivePublicUrl,
          ownerId: 'default',
          version: '0.1.0',
          platform: `${os.platform()}-${os.arch()}`,
        });
        logger.info({ agentId: agentInfo.id, name: agentInfo.name }, 'Agent registered');
      }
    }

    const server = new VPWebSocketServer({ port, cwd, sessionTimeoutMs, authProvider });
    await server.start();

    const authMode = supabaseUrl ? 'supabase' : authProvider ? 'token' : 'none';
    logger.info(
      {
        port,
        cwd,
        sessionTimeout: `${sessionTimeoutMs / 1000}s`,
        auth: authMode,
        registry: supabaseUrl ? 'supabase' : registry ? 'filesystem' : 'none',
      },
      'VibePilot Agent started'
    );

    // Start heartbeat if registered
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    if (registry) {
      heartbeatInterval = setInterval(async () => {
        try {
          const agents = await registry!.listByOwner('default');
          for (const agent of agents) {
            if (agent.status === 'online') {
              await registry!.heartbeat(agent.id);
            }
          }
        } catch (err) {
          logger.error({ err }, 'Heartbeat failed');
        }
      }, 30_000);
    }

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (registry) {
        const agents = await registry.listByOwner('default');
        for (const agent of agents) {
          await registry.unregister(agent.id);
        }
      }
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

program
  .command('project:add')
  .description('Add a new project')
  .argument('<name>', 'Project name')
  .argument('[path]', 'Project path (default: current directory)')
  .option('-f, --favorite', 'Mark as favorite')
  .option('-c, --color <hex>', 'Project color (hex code)')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (name, projectPath, opts) => {
    const manager = new ProjectManager();
    await manager.load();

    try {
      const project = await manager.addProject(name, projectPath || process.cwd(), {
        favorite: opts.favorite,
        color: opts.color,
        tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined,
      });

      console.log(`✅ Project "${name}" added successfully`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Path: ${project.path}`);
    } catch (err: any) {
      console.error(`❌ Failed to add project: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('project:list')
  .description('List all projects')
  .option('-j, --json', 'Output as JSON')
  .action(async (opts) => {
    const manager = new ProjectManager();
    await manager.load();
    const projects = manager.listProjects();

    if (opts.json) {
      console.log(JSON.stringify({ projects }, null, 2));
    } else {
      console.log(`\nProjects (${projects.length}):`);
      if (projects.length === 0) {
        console.log('  (none)');
      } else {
        projects.forEach((p) => {
          const star = p.favorite ? '★' : ' ';
          const id = p.id.slice(0, 8);
          console.log(`  ${star} ${p.name} [${id}]`);
          console.log(`     ${p.path}`);
          if (p.tags && p.tags.length > 0) {
            console.log(`     Tags: ${p.tags.join(', ')}`);
          }
        });
      }
      console.log();
    }
  });

program
  .command('project:remove')
  .description('Remove a project')
  .argument('<projectId>', 'Project ID (first 8 chars sufficient)')
  .action(async (projectId) => {
    const manager = new ProjectManager();
    await manager.load();

    // Find project by partial ID or full ID
    const projects = manager.listProjects();
    const project = projects.find((p) => p.id === projectId || p.id.startsWith(projectId));

    if (!project) {
      console.error(`❌ Project not found: ${projectId}`);
      process.exit(1);
    }

    try {
      await manager.removeProject(project.id);
      console.log(`✅ Project "${project.name}" removed successfully`);
    } catch (err: any) {
      console.error(`❌ Failed to remove project: ${err.message}`);
      process.exit(1);
    }
  });

export { program };

// Only parse if run directly (not imported for testing)
const arg1 = process.argv[1] || '';
const isDirectRun = arg1.endsWith('vibepilot.js') || arg1.endsWith('vibepilot.ts');
if (isDirectRun) {
  program.parse();
}
