import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { TunnelProxy } from '../../src/transport/TunnelProxy.js';

// Helper: create a simple HTTP server on a random port
function createTestServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        // Echo back request details
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom': 'test-header',
        });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body,
          })
        );
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

describe('TunnelProxy', () => {
  let proxy: TunnelProxy;
  let testServer: http.Server;
  let testPort: number;

  beforeEach(async () => {
    const { server, port } = await createTestServer();
    testServer = server;
    testPort = port;
    proxy = new TunnelProxy();
  });

  afterEach(async () => {
    proxy.closeAll();
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });

  it('opens a tunnel to a target port', () => {
    proxy.open('tunnel-1', testPort);
    expect(proxy.isOpen('tunnel-1')).toBe(true);
  });

  it('refuses to open a duplicate tunnel ID', () => {
    proxy.open('tunnel-1', testPort);
    expect(() => proxy.open('tunnel-1', testPort)).toThrow('already open');
  });

  it('closes a tunnel', () => {
    proxy.open('tunnel-1', testPort);
    proxy.close('tunnel-1');
    expect(proxy.isOpen('tunnel-1')).toBe(false);
  });

  it('forwards a GET request and returns the response', async () => {
    proxy.open('tunnel-1', testPort);

    const response = await proxy.forward('tunnel-1', {
      requestId: 'req-1',
      method: 'GET',
      path: '/api/test?foo=bar',
      headers: { Accept: 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/json');
    expect(response.headers['x-custom']).toBe('test-header');

    // Decode the response body
    const body = JSON.parse(Buffer.from(response.body!, 'base64').toString('utf-8'));
    expect(body.method).toBe('GET');
    expect(body.url).toBe('/api/test?foo=bar');
  });

  it('forwards a POST request with body', async () => {
    proxy.open('tunnel-1', testPort);

    const requestBody = JSON.stringify({ hello: 'world' });
    const response = await proxy.forward('tunnel-1', {
      requestId: 'req-2',
      method: 'POST',
      path: '/api/data',
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody).toString('base64'),
    });

    expect(response.status).toBe(200);

    const body = JSON.parse(Buffer.from(response.body!, 'base64').toString('utf-8'));
    expect(body.method).toBe('POST');
    expect(body.body).toBe(requestBody);
  });

  it('returns error for unknown tunnel ID', async () => {
    await expect(
      proxy.forward('no-such-tunnel', {
        requestId: 'req-3',
        method: 'GET',
        path: '/',
        headers: {},
      })
    ).rejects.toThrow('not open');
  });

  it('returns error when target server is unreachable', async () => {
    // Use a port that nothing listens on
    proxy.open('tunnel-dead', 19999);

    await expect(
      proxy.forward('tunnel-dead', {
        requestId: 'req-4',
        method: 'GET',
        path: '/',
        headers: {},
      })
    ).rejects.toThrow();
  });

  it('forwards non-200 status codes correctly', async () => {
    // Create a server that returns 404
    const notFoundServer = await new Promise<{ server: http.Server; port: number }>((resolve) => {
      const server = http.createServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        resolve({ server, port: addr.port });
      });
    });

    proxy.open('tunnel-404', notFoundServer.port);

    const response = await proxy.forward('tunnel-404', {
      requestId: 'req-404',
      method: 'GET',
      path: '/missing',
      headers: {},
    });

    expect(response.status).toBe(404);
    expect(response.requestId).toBe('req-404');
    const body = Buffer.from(response.body!, 'base64').toString('utf-8');
    expect(body).toBe('Not Found');

    await new Promise<void>((resolve) => notFoundServer.server.close(() => resolve()));
  });

  it('preserves binary body through base64 encoding roundtrip', async () => {
    proxy.open('tunnel-1', testPort);

    // Create a binary buffer with bytes 0-255
    const binaryData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i;
    }

    const response = await proxy.forward('tunnel-1', {
      requestId: 'req-binary',
      method: 'POST',
      path: '/api/binary',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: binaryData.toString('base64'),
    });

    expect(response.status).toBe(200);
    // The echo server returns JSON with the body as a string, so we verify
    // the request was sent correctly by checking the Content-Length header
    const responseBody = JSON.parse(Buffer.from(response.body!, 'base64').toString('utf-8'));
    expect(responseBody.headers['content-length']).toBe('256');
  });

  it('handles concurrent requests to the same tunnel', async () => {
    proxy.open('tunnel-1', testPort);

    const requests = Array.from({ length: 5 }, (_, i) =>
      proxy.forward('tunnel-1', {
        requestId: `req-concurrent-${i}`,
        method: 'GET',
        path: `/api/item/${i}`,
        headers: {},
      })
    );

    const responses = await Promise.all(requests);

    // Each response should have its own requestId and correct path
    for (let i = 0; i < 5; i++) {
      expect(responses[i].requestId).toBe(`req-concurrent-${i}`);
      expect(responses[i].status).toBe(200);
      const body = JSON.parse(Buffer.from(responses[i].body!, 'base64').toString('utf-8'));
      expect(body.url).toBe(`/api/item/${i}`);
    }
  });

  it('closeAll closes all open tunnels', () => {
    proxy.open('t1', testPort);
    proxy.open('t2', testPort);
    expect(proxy.isOpen('t1')).toBe(true);
    expect(proxy.isOpen('t2')).toBe(true);

    proxy.closeAll();
    expect(proxy.isOpen('t1')).toBe(false);
    expect(proxy.isOpen('t2')).toBe(false);
  });
});
