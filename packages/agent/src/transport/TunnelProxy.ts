import * as http from 'node:http';

export interface TunnelForwardRequest {
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string; // base64-encoded
}

export interface TunnelForwardResponse {
  requestId: string;
  status: number;
  headers: Record<string, string>;
  body?: string; // base64-encoded
}

interface TunnelEntry {
  targetPort: number;
  targetHost: string;
}

export class TunnelProxy {
  private tunnels = new Map<string, TunnelEntry>();

  open(tunnelId: string, targetPort: number, targetHost = '127.0.0.1'): void {
    if (this.tunnels.has(tunnelId)) {
      throw new Error(`Tunnel "${tunnelId}" is already open`);
    }
    this.tunnels.set(tunnelId, { targetPort, targetHost });
  }

  close(tunnelId: string): void {
    this.tunnels.delete(tunnelId);
  }

  closeAll(): void {
    this.tunnels.clear();
  }

  isOpen(tunnelId: string): boolean {
    return this.tunnels.has(tunnelId);
  }

  async forward(tunnelId: string, req: TunnelForwardRequest): Promise<TunnelForwardResponse> {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) {
      throw new Error(`Tunnel "${tunnelId}" is not open`);
    }

    const { targetPort, targetHost } = tunnel;

    return new Promise<TunnelForwardResponse>((resolve, reject) => {
      const bodyBuffer = req.body ? Buffer.from(req.body, 'base64') : undefined;

      const options: http.RequestOptions = {
        hostname: targetHost,
        port: targetPort,
        path: req.path,
        method: req.method,
        headers: {
          ...req.headers,
          ...(bodyBuffer ? { 'Content-Length': String(bodyBuffer.length) } : {}),
        },
      };

      const httpReq = http.request(options, (httpRes) => {
        const chunks: Buffer[] = [];

        httpRes.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        httpRes.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          const flatHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(httpRes.headers)) {
            if (value !== undefined) {
              flatHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
            }
          }

          resolve({
            requestId: req.requestId,
            status: httpRes.statusCode ?? 500,
            headers: flatHeaders,
            body: responseBody.length > 0 ? responseBody.toString('base64') : undefined,
          });
        });

        httpRes.on('error', (err) => {
          reject(err);
        });
      });

      httpReq.on('error', (err) => {
        reject(err);
      });

      if (bodyBuffer) {
        httpReq.write(bodyBuffer);
      }
      httpReq.end();
    });
  }
}
