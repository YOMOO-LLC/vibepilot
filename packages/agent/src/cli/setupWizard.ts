import { select, input } from '@inquirer/prompts';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { ConfigManager, type VibePilotConfig } from '../config/ConfigManager.js';
import { DeviceAuthServer } from '../auth/DeviceAuthServer.js';
import { CredentialManager, type Credentials } from '../auth/CredentialManager.js';

export interface SetupWizardOptions {
  /** When false, don't auto-open the browser — just print the URL. Defaults to true. */
  openBrowser?: boolean;
}

const DEFAULT_CLOUD_URL = 'https://vibepilot.cloud';

/**
 * First-time setup wizard for VibePilot.
 * Guides the user through authentication mode selection, optional cloud/device auth,
 * and project directory configuration.
 */
export async function runSetupWizard(
  configManager: ConfigManager,
  options: SetupWizardOptions = {}
): Promise<void> {
  const { openBrowser = true } = options;

  console.log("\n  Welcome to VibePilot! Let's set up your agent.\n");

  const config = configManager.getDefault();

  // ── Step 1: Auth mode selection ──────────────────────────────
  const mode = await select({
    message: 'Choose authentication mode:',
    choices: [
      { name: 'VibePilot Cloud (Recommended)', value: 'cloud' },
      { name: 'Self-Hosted Cloud', value: 'self-hosted' },
      { name: 'Local Token', value: 'token' },
      { name: 'No Authentication', value: 'none' },
    ],
  });

  config.auth.mode = mode as VibePilotConfig['auth']['mode'];

  // ── Step 2: Auth-mode-specific setup ─────────────────────────
  switch (mode) {
    case 'cloud': {
      await handleCloudAuth(config, openBrowser);
      break;
    }
    case 'self-hosted': {
      await handleSelfHostedAuth(config, openBrowser);
      break;
    }
    case 'token': {
      const token = await input({
        message: 'Authentication token:',
      });
      config.token = token;
      break;
    }
    case 'none': {
      // Nothing extra to configure
      break;
    }
  }

  // ── Step 3: Project directory ────────────────────────────────
  const cwd = process.cwd();
  const projectAction = await select({
    message: 'Add a project directory?',
    choices: [
      { name: `Yes, add current directory (${cwd})`, value: 'cwd' },
      { name: 'Yes, choose another directory', value: 'other' },
      { name: 'Skip for now', value: 'skip' },
    ],
  });

  if (projectAction === 'cwd' || projectAction === 'other') {
    let projectPath = cwd;

    if (projectAction === 'other') {
      projectPath = await input({
        message: 'Project path:',
        default: cwd,
      });
    }

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
  }

  // ── Step 4: Save and print summary ───────────────────────────
  await configManager.save(config);

  console.log('\n  Setup complete!');
  console.log('  ──────────────');
  console.log(`  Auth mode:  ${config.auth.mode}`);
  if (config.projects.length > 0) {
    console.log(`  Projects:   ${config.projects.map((p) => p.name).join(', ')}`);
  }
  console.log('\n  Run `vibepilot serve` to start your agent.\n');
}

/**
 * Handle VibePilot Cloud authentication:
 * 1. Fetch config from web endpoint
 * 2. Run device auth flow
 * 3. Save credentials
 */
async function handleCloudAuth(config: VibePilotConfig, openBrowser: boolean): Promise<void> {
  const webUrl = DEFAULT_CLOUD_URL;

  // Fetch cloud config
  let supabaseUrl: string;
  let anonKey: string;
  try {
    const response = await fetch(`${webUrl}/api/config`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { supabaseUrl: string; anonKey: string };
    supabaseUrl = data.supabaseUrl;
    anonKey = data.anonKey;
  } catch (err) {
    console.error(`  Failed to fetch cloud config: ${(err as Error).message}`);
    console.log('  Falling back to "none" auth mode. You can retry with `vibepilot config:auth`.');
    config.auth.mode = 'none';
    return;
  }

  // Run device auth flow
  try {
    await runDeviceAuth(webUrl, supabaseUrl, anonKey, openBrowser);
    config.cloud = { webUrl };
  } catch (err) {
    console.error(`  Authentication failed: ${(err as Error).message}`);
    console.log('  You can retry with `vibepilot config:auth`.');
    config.auth.mode = 'none';
  }
}

/**
 * Handle self-hosted cloud authentication:
 * 1. Prompt for connection details
 * 2. Run device auth flow
 * 3. Save credentials
 */
async function handleSelfHostedAuth(config: VibePilotConfig, openBrowser: boolean): Promise<void> {
  const webUrl = await input({
    message: 'Self-hosted web URL:',
  });
  const supabaseUrl = await input({
    message: 'Supabase URL:',
  });
  const anonKey = await input({
    message: 'Supabase anon key:',
  });

  // Run device auth flow
  try {
    await runDeviceAuth(webUrl, supabaseUrl, anonKey, openBrowser);
    config.selfHosted = { webUrl, supabaseUrl, anonKey };
  } catch (err) {
    console.error(`  Authentication failed: ${(err as Error).message}`);
    console.log('  You can retry with `vibepilot config:auth`.');
    config.auth.mode = 'none';
  }
}

/**
 * Shared device auth flow: start local server, open browser, wait for callback, save credentials.
 */
async function runDeviceAuth(
  webUrl: string,
  supabaseUrl: string,
  anonKey: string,
  openBrowser: boolean
): Promise<void> {
  const authServer = new DeviceAuthServer();
  const { authUrl } = await authServer.start(webUrl);

  console.log(`\n  Opening browser for authentication...`);
  console.log(`  URL: ${authUrl}\n`);

  if (openBrowser) {
    try {
      const open = (await import('open')).default;
      await open(authUrl);
    } catch {
      console.log('  Could not open browser automatically. Please visit the URL above.');
    }
  }

  try {
    const callbackResult = await authServer.waitForCallback();

    // Build and save credentials
    const userId = CredentialManager.extractUserId(callbackResult.accessToken);
    const credentials: Credentials = {
      version: '0.1.0',
      supabaseUrl,
      anonKey,
      accessToken: callbackResult.accessToken,
      refreshToken: callbackResult.refreshToken,
      expiresAt: Date.now() + callbackResult.expiresIn * 1000,
      userId,
      email: '',
      createdAt: Date.now(),
    };

    const credentialManager = new CredentialManager();
    await credentialManager.save(credentials);

    console.log('  Authentication successful!');
  } finally {
    await authServer.close();
  }
}
