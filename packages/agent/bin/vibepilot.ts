#!/usr/bin/env node
import { Command } from 'commander';
import * as os from 'os';
import { VPWebSocketServer } from '../src/transport/WebSocketServer.js';
import { DEFAULT_PORT } from '@vibepilot/protocol';
import { logger } from '../src/utils/logger.js';
import { ProjectManager } from '../src/config/ProjectManager.js';
import { ConfigManager } from '../src/config/ConfigManager.js';
import { TokenAuthProvider } from '../src/auth/TokenAuthProvider.js';
import { SupabaseAuthProvider } from '../src/auth/SupabaseAuthProvider.js';
import { CredentialManager } from '../src/auth/CredentialManager.js';
import { DeviceAuthServer } from '../src/auth/DeviceAuthServer.js';
import { FileSystemRegistry } from '../src/registry/FileSystemRegistry.js';
import { SupabaseRegistry } from '../src/registry/SupabaseRegistry.js';
import { SupabaseUserRegistry } from '../src/registry/SupabaseUserRegistry.js';
import { runSetupWizard } from '../src/cli/setupWizard.js';
import { configMain, configAuth, configServer, configProjects } from '../src/cli/configCommand.js';
import type { AuthProvider } from '../src/auth/AuthProvider.js';
import type { AgentRegistry } from '../src/registry/AgentRegistry.js';
import { RealtimePresence } from '../src/transport/RealtimePresence.js';
import { createClient } from '@supabase/supabase-js';

const program = new Command();

program
  .name('vibepilot')
  .description('VibePilot Agent - local development bridge')
  .version('0.1.0');

// ── serve command ────────────────────────────────────────────────

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
  .option('--owner-id <uuid>', 'Owner user UUID for Supabase agent registration')
  .action(async (opts, cmd) => {
    // ── First-run setup wizard ──────────────────────────────────
    const configManager = new ConfigManager();
    if (!(await configManager.exists())) {
      await runSetupWizard(configManager);
    }
    const config = await configManager.load();

    // ── Resolve settings: CLI flags > config.json > defaults ────
    // Use getOptionValueSource() for reliable detection of explicit CLI flags
    const port =
      cmd.getOptionValueSource('port') === 'cli' ? parseInt(opts.port, 10) : config.server.port;

    const cwd =
      cmd.getOptionValueSource('dir') === 'cli'
        ? opts.dir
        : config.projects.length > 0
          ? config.projects[0].path
          : process.cwd();

    const sessionTimeoutMs =
      cmd.getOptionValueSource('sessionTimeout') === 'cli'
        ? parseInt(opts.sessionTimeout, 10) * 1000
        : config.server.sessionTimeout * 1000;

    const agentName =
      cmd.getOptionValueSource('agentName') === 'cli' ? opts.agentName : config.server.agentName;

    // ── Determine auth mode ─────────────────────────────────────
    // Backward compatibility: explicit CLI flags / env vars override config
    const supabaseUrl = opts.supabaseUrl || process.env.VP_SUPABASE_URL;
    const supabaseKey = opts.supabaseKey || process.env.VP_SUPABASE_KEY;

    // Initialize auth provider
    let authProvider: AuthProvider | undefined;

    if (supabaseUrl) {
      // Explicit Supabase URL from CLI flag or env var
      authProvider = new SupabaseAuthProvider(supabaseUrl);
      logger.info('Supabase authentication enabled');
    } else if (opts.token || process.env.VP_TOKEN) {
      // Explicit token from CLI flag or env var
      const token = opts.token || process.env.VP_TOKEN;
      authProvider = new TokenAuthProvider(token);
      logger.info('Token authentication enabled');
    } else {
      // Use config-based auth mode
      switch (config.auth.mode) {
        case 'cloud':
        case 'self-hosted': {
          const credManager = new CredentialManager();
          const creds = await credManager.load();
          if (creds) {
            try {
              const refreshed = await credManager.refreshIfNeeded(creds);
              if (refreshed !== creds) {
                await credManager.save(refreshed);
              }
              authProvider = new SupabaseAuthProvider(refreshed.supabaseUrl);
              logger.info('Supabase authentication enabled (from stored credentials)');
            } catch (err: any) {
              logger.error(
                { err: err.message },
                'Failed to use stored credentials. Run "vibepilot auth:login" to re-authenticate.'
              );
            }
          }
          break;
        }
        case 'token': {
          if (config.token) {
            authProvider = new TokenAuthProvider(config.token);
            logger.info('Token authentication enabled (from config)');
          }
          break;
        }
        case 'none':
        default:
          // No auth
          break;
      }
    }

    // ── Initialize agent registry ───────────────────────────────
    let registry: AgentRegistry | undefined;
    let registeredAgentId: string | undefined;
    let presence: RealtimePresence | undefined;
    let webrtcSignaling: any;
    const publicUrl = opts.publicUrl || process.env.VP_PUBLIC_URL;

    if (supabaseUrl && supabaseKey) {
      // Supabase registry mode (explicit service_role key)
      registry = new SupabaseRegistry(supabaseUrl, supabaseKey);
      const effectivePublicUrl = publicUrl || `ws://localhost:${port}`;

      const ownerId = opts.ownerId || process.env.VP_OWNER_ID;
      if (!ownerId) {
        logger.error('Supabase registry requires --owner-id <uuid> (the Supabase Auth user UUID)');
        process.exit(1);
      }

      const agentInfo = await registry.register({
        name: agentName,
        publicUrl: effectivePublicUrl,
        ownerId,
        version: '0.1.0',
        platform: `${os.platform()}-${os.arch()}`,
      });
      registeredAgentId = agentInfo.id;
      logger.info({ agentId: agentInfo.id, name: agentInfo.name }, 'Agent registered (Supabase)');

      // Initialize RealtimePresence and broadcast online status
      // Note: For service_role mode, we cannot use presence (requires user JWT)
      logger.warn('RealtimePresence not available in service_role mode (requires user JWT)');
    } else if (!supabaseUrl && !supabaseKey) {
      // No explicit Supabase flags — try stored credentials
      const credManager = new CredentialManager();
      const creds = await credManager.load();

      if (creds) {
        try {
          const refreshed = await credManager.refreshIfNeeded(creds);
          if (refreshed !== creds) {
            await credManager.save(refreshed);
          }

          // Use SupabaseUserRegistry (user JWT, no service_role key needed)
          registry = new SupabaseUserRegistry(
            refreshed.supabaseUrl,
            refreshed.anonKey,
            refreshed.accessToken
          );
          const effectivePublicUrl = publicUrl || `ws://localhost:${port}`;

          const agentInfo = await registry.register({
            name: agentName,
            publicUrl: effectivePublicUrl,
            ownerId: refreshed.userId,
            version: '0.1.0',
            platform: `${os.platform()}-${os.arch()}`,
          });
          registeredAgentId = agentInfo.id;
          logger.info(
            { agentId: agentInfo.id, name: agentInfo.name },
            'Agent registered (credentials)'
          );

          // Initialize RealtimePresence and broadcast online status
          const supabase = createClient(refreshed.supabaseUrl, refreshed.anonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${refreshed.accessToken}`,
              },
            },
          });

          presence = new RealtimePresence(supabase, refreshed.userId);
          await presence.announceOnline(agentInfo.id, {
            agentId: agentInfo.id,
            name: agentInfo.name,
            platform: os.platform() as 'darwin' | 'linux' | 'win32',
            publicKey: undefined,
            onlineAt: new Date().toISOString(),
          });
          logger.info({ channel: `user:${refreshed.userId}:agents` }, 'Presence broadcast started');

          // Initialize WebRTC signaling
          const { WebRTCSignaling } = await import('../src/transport/WebRTCSignaling.js');
          webrtcSignaling = new WebRTCSignaling(supabase, refreshed.userId, agentInfo.id);

          // Get presence channel and start listening
          const presenceChannel = supabase.channel(`user:${refreshed.userId}:agents`);
          await webrtcSignaling.start(presenceChannel);

          logger.info('WebRTC signaling initialized');
        } catch (err: any) {
          logger.error(
            { err: err.message },
            'Failed to use stored credentials. Run "vibepilot auth:login" to re-authenticate.'
          );
        }
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
          registeredAgentId = agentInfo.id;
          logger.info({ agentId: agentInfo.id, name: agentInfo.name }, 'Agent registered');
        }
      }
    }

    const server = new VPWebSocketServer({ port, cwd, sessionTimeoutMs, authProvider });
    await server.start();

    const authLabel =
      authProvider instanceof SupabaseAuthProvider ? 'supabase' : authProvider ? 'token' : 'none';
    const registryLabel =
      registry instanceof SupabaseRegistry || registry instanceof SupabaseUserRegistry
        ? 'supabase'
        : registry
          ? 'filesystem'
          : 'none';
    logger.info(
      {
        port,
        cwd,
        sessionTimeout: `${sessionTimeoutMs / 1000}s`,
        auth: authLabel,
        registry: registryLabel,
      },
      'VibePilot Agent started'
    );

    // Start heartbeat if registered
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    if (registry && registeredAgentId) {
      const agentId = registeredAgentId;
      heartbeatInterval = setInterval(async () => {
        try {
          await registry!.heartbeat(agentId);
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
      if (presence) {
        try {
          await presence.announceOffline();
        } catch (err) {
          logger.error({ err }, 'Failed to announce offline during shutdown');
        }
      }
      if (webrtcSignaling) {
        try {
          await webrtcSignaling.stop();
          logger.info('WebRTC signaling stopped');
        } catch (err) {
          logger.error({ err }, 'Failed to stop WebRTC signaling');
        }
      }
      if (registry && registeredAgentId) {
        try {
          await registry.unregister(registeredAgentId);
        } catch (err) {
          logger.error({ err }, 'Failed to unregister during shutdown');
        }
      }
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// ── project commands ─────────────────────────────────────────────

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

      console.log(`Project "${name}" added successfully`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Path: ${project.path}`);
    } catch (err: any) {
      console.error(`Failed to add project: ${err.message}`);
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
          const star = p.favorite ? '*' : ' ';
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
      console.error(`Project not found: ${projectId}`);
      process.exit(1);
    }

    try {
      await manager.removeProject(project.id);
      console.log(`Project "${project.name}" removed successfully`);
    } catch (err: any) {
      console.error(`Failed to remove project: ${err.message}`);
      process.exit(1);
    }
  });

// ── auth commands (colon-style) ──────────────────────────────────

program
  .command('auth:login')
  .description('Authenticate with VibePilot Cloud')
  .option('--no-browser', 'Do not auto-open the browser')
  .action(async (opts) => {
    const configManager = new ConfigManager();
    const config = await configManager.load();

    const credManager = new CredentialManager();
    const existing = await credManager.load();

    if (existing) {
      console.log(
        `Already logged in as ${existing.email || existing.userId}. Run "vibepilot auth:logout" first.`
      );
      return;
    }

    // Determine webUrl based on auth mode
    let webUrl: string;
    let supabaseUrl: string | undefined;
    let anonKey: string | undefined;

    if (config.auth.mode === 'cloud' && config.cloud?.webUrl) {
      webUrl = config.cloud.webUrl;
      // Validate URL before making network request
      const parsedUrl = new URL('/api/config', webUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        console.error(`Invalid cloud URL protocol: ${parsedUrl.protocol}`);
        process.exit(1);
      }
      // Fetch supabaseUrl/anonKey from /api/config
      try {
        const resp = await fetch(parsedUrl.toString());
        if (!resp.ok) {
          console.error(`Failed to fetch cloud config from ${webUrl}: HTTP ${resp.status}`);
          process.exit(1);
        }
        const cloudConfig = (await resp.json()) as { supabaseUrl: string; anonKey: string };
        if (!cloudConfig.supabaseUrl || !cloudConfig.anonKey) {
          console.error(
            `Invalid cloud config response from ${webUrl}: missing supabaseUrl or anonKey`
          );
          process.exit(1);
        }
        supabaseUrl = cloudConfig.supabaseUrl;
        anonKey = cloudConfig.anonKey;
      } catch (err: any) {
        console.error(`Failed to fetch cloud config from ${webUrl}: ${err.message}`);
        process.exit(1);
      }
    } else if (config.auth.mode === 'self-hosted' && config.selfHosted) {
      webUrl = config.selfHosted.webUrl;
      supabaseUrl = config.selfHosted.supabaseUrl;
      anonKey = config.selfHosted.anonKey;
    } else {
      // Fallback: use VP_CLOUD_URL env var or default
      webUrl = process.env.VP_CLOUD_URL || 'https://vibepilot.cloud';
      // Fetch supabaseUrl/anonKey for the fallback path too
      try {
        const fallbackUrl = new URL('/api/config', webUrl);
        const resp = await fetch(fallbackUrl.toString());
        if (resp.ok) {
          const cloudConfig = (await resp.json()) as { supabaseUrl: string; anonKey: string };
          supabaseUrl = cloudConfig.supabaseUrl;
          anonKey = cloudConfig.anonKey;
        }
      } catch {
        // Non-fatal: credentials callback may still provide these
      }
    }

    const deviceServer = new DeviceAuthServer();
    const { authUrl } = await deviceServer.start(webUrl);

    console.log(`\nOpen this URL in your browser to authenticate:\n  ${authUrl}\n`);

    if (opts.browser !== false) {
      const open = (await import('open')).default;
      await open(authUrl);
      console.log('Browser opened. Waiting for authentication...\n');
    } else {
      console.log('Waiting for authentication...\n');
    }

    try {
      const result = await deviceServer.waitForCallback();

      // Use pre-fetched values or fall back to callback result
      const finalSupabaseUrl = supabaseUrl || result.supabaseUrl;
      const finalAnonKey = anonKey || result.anonKey;

      if (!finalSupabaseUrl || !finalAnonKey) {
        console.error(
          'Authentication succeeded but Supabase configuration is missing. Please configure auth mode first with "vibepilot config:auth".'
        );
        process.exit(1);
      }

      const userId = CredentialManager.extractUserId(result.accessToken);

      await credManager.save({
        version: '0.1.0',
        supabaseUrl: finalSupabaseUrl,
        anonKey: finalAnonKey,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        userId,
        email: '', // Will be populated on next status check
        createdAt: Date.now(),
      });

      console.log(`Authentication successful! Credentials saved.`);
    } catch (err: any) {
      console.error(`Authentication failed: ${err.message}`);
      process.exit(1);
    } finally {
      await deviceServer.close();
    }
  });

program
  .command('auth:logout')
  .description('Remove stored credentials')
  .action(async () => {
    const credManager = new CredentialManager();
    const existing = await credManager.load();

    if (!existing) {
      console.log('Not logged in.');
      return;
    }

    await credManager.clear();
    console.log('Logged out successfully. Credentials removed.');
  });

program
  .command('auth:status')
  .description('Show current authentication status')
  .action(async () => {
    const credManager = new CredentialManager();
    const creds = await credManager.load();

    if (!creds) {
      console.log('Not logged in. Run "vibepilot auth:login" to authenticate.');
      return;
    }

    const expiresIn = Math.max(0, Math.round((creds.expiresAt - Date.now()) / 1000));
    const expired = expiresIn === 0;

    console.log(`\nAuthentication Status:`);
    console.log(`  Email:    ${creds.email || '(not set)'}`);
    console.log(`  User ID:  ${creds.userId}`);
    console.log(`  Supabase: ${creds.supabaseUrl}`);
    console.log(
      `  Token:    ${expired ? 'EXPIRED' : `expires in ${Math.round(expiresIn / 60)} min`}`
    );
    console.log();
  });

// ── config commands ──────────────────────────────────────────────

program
  .command('config')
  .description('Interactive configuration')
  .action(async () => {
    const configManager = new ConfigManager();
    await configMain(configManager);
  });

program
  .command('config:auth')
  .description('Configure authentication')
  .action(async () => {
    const configManager = new ConfigManager();
    await configAuth(configManager);
  });

program
  .command('config:server')
  .description('Configure server settings')
  .action(async () => {
    const configManager = new ConfigManager();
    await configServer(configManager);
  });

program
  .command('config:projects')
  .description('Manage projects')
  .action(async () => {
    const configManager = new ConfigManager();
    await configProjects(configManager);
  });

export { program };

// Only parse if run directly (not imported for testing)
const arg1 = process.argv[1] || '';
const isDirectRun = arg1.endsWith('vibepilot.js') || arg1.endsWith('vibepilot.ts');
if (isDirectRun) {
  program.parse();
}
