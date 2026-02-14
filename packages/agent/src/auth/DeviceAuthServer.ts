import * as http from 'node:http';

export interface CallbackResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  supabaseUrl: string;
  anonKey: string;
}

export interface StartResult {
  port: number;
  authUrl: string;
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>VibePilot - Auth Success</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb}
.card{text-align:center;padding:2rem;border-radius:12px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
h1{color:#059669;margin:0 0 0.5rem}p{color:#6b7280}</style>
</head><body><div class="card"><h1>Authentication Successful</h1>
<p>You can close this window and return to the terminal.</p></div></body></html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html><head><title>VibePilot - Auth Error</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb}
.card{text-align:center;padding:2rem;border-radius:12px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
h1{color:#dc2626;margin:0 0 0.5rem}p{color:#6b7280}</style>
</head><body><div class="card"><h1>Authentication Failed</h1>
<p>${msg}</p></div></body></html>`;

const REQUIRED_PARAMS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'user_id',
  'supabase_url',
  'anon_key',
];

export class DeviceAuthServer {
  private server: http.Server | null = null;
  private resolve: ((result: CallbackResult) => void) | null = null;
  private reject: ((err: Error) => void) | null = null;

  async start(cloudUrl: string): Promise<StartResult> {
    const port = await this.bindToRandomPort();

    const authUrl = `${cloudUrl.replace(/\/$/, '')}/auth/device?port=${port}`;

    return { port, authUrl };
  }

  waitForCallback(timeoutMs: number = 120_000): Promise<CallbackResult> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      const timer = setTimeout(() => {
        reject(new Error('Authentication timed out waiting for browser callback'));
        this.close().catch(() => {});
      }, timeoutMs);

      // Prevent timer from keeping process alive
      if (timer.unref) timer.unref();
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  private async bindToRandomPort(): Promise<number> {
    const MIN_PORT = 19800;
    const MAX_PORT = 19899;

    return new Promise((resolve, reject) => {
      const port = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1));
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.listen(port, '127.0.0.1', () => {
        resolve(port);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Try another port
          this.server = http.createServer((req, res) => this.handleRequest(req, res));
          const nextPort = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1));
          this.server.listen(nextPort, '127.0.0.1', () => resolve(nextPort));
        } else {
          reject(err);
        }
      });
    });
  }

  private corsHeaders(req: http.IncomingMessage): Record<string, string> {
    const origin = req.headers.origin || '*';
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const cors = this.corsHeaders(req);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (url.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...cors });
      res.end('Not Found');
      return;
    }

    // Check required parameters
    const missing = REQUIRED_PARAMS.filter((p) => !url.searchParams.get(p));
    if (missing.length > 0) {
      const isJsonRequest = req.headers.accept?.includes('application/json');
      if (isJsonRequest) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ error: `Missing parameters: ${missing.join(', ')}` }));
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html', ...cors });
        res.end(ERROR_HTML(`Missing parameters: ${missing.join(', ')}`));
      }
      this.reject?.(new Error(`Missing callback parameters: ${missing.join(', ')}`));
      return;
    }

    // Validate expires_at parameter
    const expiresAtSeconds = parseInt(url.searchParams.get('expires_at')!, 10);
    if (isNaN(expiresAtSeconds) || expiresAtSeconds <= 0) {
      const msg = 'Invalid expires_at: must be a positive number';
      const isJsonRequest = req.headers.accept?.includes('application/json');
      if (isJsonRequest) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...cors,
        });
        res.end(JSON.stringify({ error: msg }));
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', ...cors });
        res.end(ERROR_HTML(msg));
      }
      this.reject?.(new Error(msg));
      return;
    }

    // Extract tokens and convert expires_at from seconds to milliseconds
    const result: CallbackResult = {
      accessToken: url.searchParams.get('access_token')!,
      refreshToken: url.searchParams.get('refresh_token')!,
      expiresAt: expiresAtSeconds * 1000,
      userId: url.searchParams.get('user_id')!,
      supabaseUrl: url.searchParams.get('supabase_url')!,
      anonKey: url.searchParams.get('anon_key')!,
    };

    const isJsonRequest = req.headers.accept?.includes('application/json');
    if (isJsonRequest) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', ...cors });
      res.end(SUCCESS_HTML);
    }

    this.resolve?.(result);
  }
}
