import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { decodeJwt } from 'jose';

export interface Credentials {
  version: string;
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
  createdAt: number;
}

const REQUIRED_FIELDS: (keyof Credentials)[] = [
  'version',
  'supabaseUrl',
  'anonKey',
  'accessToken',
  'refreshToken',
  'expiresAt',
  'userId',
  'createdAt',
];

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export class CredentialManager {
  private configDir: string;
  private credentialsPath: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), '.vibepilot');
    this.credentialsPath = path.join(this.configDir, 'credentials.json');
  }

  async load(): Promise<Credentials | null> {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf-8');
      const parsed = JSON.parse(data);

      // Validate required fields
      for (const field of REQUIRED_FIELDS) {
        if (parsed[field] === undefined || parsed[field] === null) {
          return null;
        }
      }

      return parsed as Credentials;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      // Invalid JSON or other parse error
      return null;
    }
  }

  async save(creds: Credentials): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(this.credentialsPath, JSON.stringify(creds, null, 2), 'utf-8');
    await fs.chmod(this.credentialsPath, 0o600);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.credentialsPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async refreshIfNeeded(creds: Credentials): Promise<Credentials> {
    const timeUntilExpiry = creds.expiresAt - Date.now();
    if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
      return creds;
    }

    // Validate URL from credentials file before making network request
    const tokenUrl = new URL('/auth/v1/token?grant_type=refresh_token', creds.supabaseUrl);
    const response = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: creds.anonKey,
      },
      body: JSON.stringify({ refresh_token: creds.refreshToken }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const refreshed: Credentials = {
      ...creds,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return refreshed;
  }

  static extractUserId(jwt: string): string {
    const payload = decodeJwt(jwt);
    if (!payload.sub) {
      throw new Error('JWT missing sub claim');
    }
    return payload.sub;
  }
}
