import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { VPWebSocketServer } from '../../src/transport/WebSocketServer.js';
import { TokenAuthProvider } from '../../src/auth/TokenAuthProvider.js';

// Mock node-pty
vi.mock('node-pty', () => {
  const createMockPty = () => {
    const dataCallbacks: Array<(data: string) => void> = [];
    const exitCallbacks: Array<(e: { exitCode: number }) => void> = [];
    let killed = false;

    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      onData: (cb: (data: string) => void) => {
        dataCallbacks.push(cb);
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        exitCallbacks.push(cb);
      },
      write: (data: string) => {
        if (killed) throw new Error('Process killed');
        setTimeout(() => dataCallbacks.forEach((cb) => cb(`output:${data}`)), 5);
      },
      resize: vi.fn(),
      kill: () => {
        killed = true;
        exitCallbacks.forEach((cb) => cb({ exitCode: 0 }));
      },
    };
  };

  return {
    default: { spawn: vi.fn(() => createMockPty()) },
    spawn: vi.fn(() => createMockPty()),
  };
});

const TEST_TOKEN = 'vp_test_auth_token_xyz';

function connectClient(port: number, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = token
      ? `ws://localhost:${port}?token=${encodeURIComponent(token)}`
      : `ws://localhost:${port}`;
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    // Handle unexpected close (auth rejection)
    ws.on('close', (code) => {
      if (code !== 1000) {
        reject(new Error(`Connection closed with code ${code}`));
      }
    });
  });
}

describe('WebSocketServer Authentication', () => {
  let server: VPWebSocketServer;
  let testPort: number;
  let clients: WebSocket[];

  beforeEach(() => {
    testPort = 19800 + Math.floor(Math.random() * 1000);
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    if (server) {
      await server.stop();
    }
  });

  it('allows connections without auth when no authProvider is set', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('allows connections with valid token', async () => {
    const authProvider = new TokenAuthProvider(TEST_TOKEN);
    server = new VPWebSocketServer({ port: testPort, authProvider });
    await server.start();

    const ws = await connectClient(testPort, TEST_TOKEN);
    clients.push(ws);

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects connections with invalid token', async () => {
    const authProvider = new TokenAuthProvider(TEST_TOKEN);
    server = new VPWebSocketServer({ port: testPort, authProvider });
    await server.start();

    await expect(connectClient(testPort, 'wrong-token')).rejects.toThrow();
  });

  it('rejects connections without token when authProvider is set', async () => {
    const authProvider = new TokenAuthProvider(TEST_TOKEN);
    server = new VPWebSocketServer({ port: testPort, authProvider });
    await server.start();

    await expect(connectClient(testPort)).rejects.toThrow();
  });

  it('rejects connections with empty token', async () => {
    const authProvider = new TokenAuthProvider(TEST_TOKEN);
    server = new VPWebSocketServer({ port: testPort, authProvider });
    await server.start();

    await expect(connectClient(testPort, '')).rejects.toThrow();
  });
});
