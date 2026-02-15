import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { DEFAULT_PORT } from '@vibepilot/protocol';
import type { ProjectInfo } from '@vibepilot/protocol';

export interface VibePilotConfig {
  version: string;
  auth: {
    mode: 'cloud' | 'self-hosted' | 'token' | 'none';
  };
  cloud?: {
    webUrl: string;
  };
  selfHosted?: {
    webUrl: string;
    supabaseUrl: string;
    anonKey: string;
  };
  token?: string;
  server: {
    port: number;
    sessionTimeout: number;
    agentName: string;
  };
  projects: ProjectInfo[];
  currentProjectId?: string | null;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), '.vibepilot');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  getDefault(): VibePilotConfig {
    return {
      version: '0.1.0',
      auth: {
        mode: 'cloud',
      },
      server: {
        port: DEFAULT_PORT,
        sessionTimeout: 300,
        agentName: os.hostname(),
      },
      projects: [],
      currentProjectId: null,
    };
  }

  async load(): Promise<VibePilotConfig> {
    const defaults = this.getDefault();

    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);

      // Deep merge with defaults so new fields added in future versions get populated
      return {
        ...defaults,
        ...parsed,
        auth: {
          ...defaults.auth,
          ...(parsed.auth || {}),
        },
        server: {
          ...defaults.server,
          ...(parsed.server || {}),
        },
        projects: Array.isArray(parsed.projects) ? parsed.projects : defaults.projects,
      };
    } catch {
      // File missing or corrupted JSON — return defaults
      return defaults;
    }
  }

  async save(config: VibePilotConfig): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    await fs.chmod(this.configPath, 0o600);
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  async reset(): Promise<void> {
    try {
      await fs.unlink(this.configPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
