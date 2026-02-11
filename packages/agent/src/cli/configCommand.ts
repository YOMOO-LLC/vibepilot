import { select, input } from '@inquirer/prompts';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { ConfigManager, type VibePilotConfig } from '../config/ConfigManager.js';

/**
 * Main interactive config menu.
 * Displays current config summary and dispatches to sub-menus.
 */
export async function configMain(configManager: ConfigManager): Promise<void> {
  const config = await configManager.load();

  console.log('\n  VibePilot Configuration');
  console.log('  ----------------------');
  console.log(`  Auth mode:     ${config.auth.mode}`);
  console.log(`  Agent name:    ${config.server.agentName}`);
  console.log(`  Port:          ${config.server.port}`);
  console.log(`  Projects:      ${config.projects.length}`);
  console.log();

  const action = await select({
    message: 'What would you like to configure?',
    choices: [
      { name: 'Authentication', value: 'auth' },
      { name: 'Server Settings', value: 'server' },
      { name: 'Projects', value: 'projects' },
      { name: 'View Full Config', value: 'view' },
      { name: 'Reset to Defaults', value: 'reset' },
    ],
  });

  switch (action) {
    case 'auth':
      await configAuth(configManager);
      break;
    case 'server':
      await configServer(configManager);
      break;
    case 'projects':
      await configProjects(configManager);
      break;
    case 'view':
      console.log(JSON.stringify(config, null, 2));
      break;
    case 'reset': {
      const defaults = configManager.getDefault();
      await configManager.save(defaults);
      console.log('Configuration reset to defaults.');
      break;
    }
  }
}

/**
 * Interactive authentication configuration.
 * Lets the user choose an auth mode and provide the required credentials.
 */
export async function configAuth(configManager: ConfigManager): Promise<void> {
  const config = await configManager.load();

  const mode = await select({
    message: 'Select authentication mode:',
    choices: [
      { name: 'VibePilot Cloud (Recommended)', value: 'cloud' },
      { name: 'Self-Hosted Cloud', value: 'self-hosted' },
      { name: 'Local Token', value: 'token' },
      { name: 'No Authentication', value: 'none' },
      { name: 'Keep current settings', value: 'keep' },
    ],
  });

  if (mode === 'keep') {
    return;
  }

  config.auth.mode = mode as VibePilotConfig['auth']['mode'];

  switch (mode) {
    case 'cloud': {
      const webUrl = await input({
        message: 'Cloud web URL:',
        default: 'https://vibepilot.cloud',
      });
      config.cloud = { webUrl };
      // Clear other auth fields
      delete config.selfHosted;
      delete config.token;
      break;
    }
    case 'self-hosted': {
      const webUrl = await input({
        message: 'Self-hosted web URL:',
        default: config.selfHosted?.webUrl || '',
      });
      const supabaseUrl = await input({
        message: 'Supabase URL:',
        default: config.selfHosted?.supabaseUrl || '',
      });
      const anonKey = await input({
        message: 'Supabase anon key:',
        default: config.selfHosted?.anonKey || '',
      });
      config.selfHosted = { webUrl, supabaseUrl, anonKey };
      // Clear other auth fields
      delete config.cloud;
      delete config.token;
      break;
    }
    case 'token': {
      const token = await input({
        message: 'Authentication token:',
        default: config.token || '',
      });
      config.token = token;
      // Clear other auth fields
      delete config.cloud;
      delete config.selfHosted;
      break;
    }
    case 'none': {
      // Clear all auth-related fields
      delete config.cloud;
      delete config.selfHosted;
      delete config.token;
      break;
    }
  }

  await configManager.save(config);
  console.log(`Authentication mode set to "${mode}".`);
}

/**
 * Interactive server settings configuration.
 * Prompts for port, session timeout, and agent name.
 */
export async function configServer(configManager: ConfigManager): Promise<void> {
  const config = await configManager.load();

  const portStr = await input({
    message: 'Server port:',
    default: String(config.server.port),
  });
  const timeoutStr = await input({
    message: 'Session timeout (seconds):',
    default: String(config.server.sessionTimeout),
  });
  const agentName = await input({
    message: 'Agent name:',
    default: config.server.agentName,
  });

  config.server.port = parseInt(portStr, 10);
  config.server.sessionTimeout = parseInt(timeoutStr, 10);
  config.server.agentName = agentName;

  await configManager.save(config);
  console.log('Server settings saved.');
}

/**
 * Interactive project management.
 * Lets the user add, remove, or favorite projects.
 */
export async function configProjects(configManager: ConfigManager): Promise<void> {
  const config = await configManager.load();

  // Show current projects
  if (config.projects.length === 0) {
    console.log('\n  No projects configured.\n');
  } else {
    console.log('\n  Current projects:');
    for (const p of config.projects) {
      const star = p.favorite ? ' [favorite]' : '';
      console.log(`    - ${p.name} (${p.path})${star}`);
    }
    console.log();
  }

  // Loop menu until user selects "back"
  let done = false;
  while (!done) {
    const choices = [
      { name: 'Add new project', value: 'add' },
      ...(config.projects.length > 0
        ? [
            { name: 'Remove a project', value: 'remove' },
            { name: 'Set favorite', value: 'favorite' },
          ]
        : []),
      { name: 'Back', value: 'back' },
    ];

    const action = await select({
      message: 'Project management:',
      choices,
    });

    switch (action) {
      case 'add': {
        const projectPath = await input({
          message: 'Project path:',
          default: process.cwd(),
        });
        const defaultName = path.basename(projectPath);
        const projectName = await input({
          message: 'Project name:',
          default: defaultName,
        });
        config.projects.push({
          id: crypto.randomUUID(),
          name: projectName,
          path: projectPath,
          favorite: false,
          createdAt: Date.now(),
        });
        await configManager.save(config);
        console.log(`Project "${projectName}" added.`);
        break;
      }
      case 'remove': {
        const removeId = await select({
          message: 'Select project to remove:',
          choices: config.projects.map((p) => ({
            name: `${p.name} (${p.path})`,
            value: p.id,
          })),
        });
        config.projects = config.projects.filter((p) => p.id !== removeId);
        await configManager.save(config);
        console.log('Project removed.');
        break;
      }
      case 'favorite': {
        const favId = await select({
          message: 'Select project to set as favorite:',
          choices: config.projects.map((p) => ({
            name: `${p.name} (${p.path})`,
            value: p.id,
          })),
        });
        for (const p of config.projects) {
          p.favorite = p.id === favId;
        }
        await configManager.save(config);
        console.log('Favorite updated.');
        break;
      }
      case 'back':
        done = true;
        break;
    }
  }
}
