import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { VPWebSocketServer } from '../../src/transport/WebSocketServer.js';
import { MessageType, createMessage, parseMessage } from '@vibepilot/protocol';

// Mock node-pty
vi.mock('node-pty', () => {
  const createMockPty = () => {
    const dataCallbacks: Array<(data: string) => void> = [];
    const exitCallbacks: Array<(e: { exitCode: number }) => void> = [];
    let killed = false;

    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      onData: (cb: (data: string) => void) => { dataCallbacks.push(cb); },
      onExit: (cb: (e: { exitCode: number }) => void) => { exitCallbacks.push(cb); },
      write: (data: string) => {
        if (killed) throw new Error('Process killed');
        setTimeout(() => dataCallbacks.forEach(cb => cb(`output:${data}`)), 5);
      },
      resize: vi.fn(),
      kill: () => {
        killed = true;
        exitCallbacks.forEach(cb => cb({ exitCode: 0 }));
      },
    };
  };

  return {
    default: { spawn: vi.fn(() => createMockPty()) },
    spawn: vi.fn(() => createMockPty()),
  };
});

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket, matchType?: string): Promise<any> {
  return new Promise((resolve) => {
    const handler = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (!matchType || msg.type === matchType) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

describe('VPWebSocketServer', () => {
  let server: VPWebSocketServer;
  let testPort: number;
  let clients: WebSocket[];

  beforeEach(() => {
    // Random port to avoid conflicts
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

  it('accepts WebSocket connections', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('creates PTY on terminal:create message', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    const responsePromise = waitForMessage(ws, MessageType.TERMINAL_CREATED);

    const msg = createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });
    ws.send(JSON.stringify(msg));

    const response = await responsePromise;
    expect(response.type).toBe(MessageType.TERMINAL_CREATED);
    expect(response.payload.sessionId).toBe('sess-1');
    expect(response.payload.pid).toBeGreaterThan(0);
  });

  it('forwards terminal:input to PTY and receives output', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    // Create terminal first
    const createdPromise = waitForMessage(ws, MessageType.TERMINAL_CREATED);
    ws.send(JSON.stringify(createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    })));
    await createdPromise;

    // Send input and wait for output
    const outputPromise = waitForMessage(ws, MessageType.TERMINAL_OUTPUT);
    ws.send(JSON.stringify(createMessage(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'ls\r',
    })));

    const output = await outputPromise;
    expect(output.type).toBe(MessageType.TERMINAL_OUTPUT);
    expect(output.payload.sessionId).toBe('sess-1');
    expect(output.payload.data).toBeTruthy();
  });

  it('handles terminal:resize', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    // Create terminal first
    const createdPromise = waitForMessage(ws, MessageType.TERMINAL_CREATED);
    ws.send(JSON.stringify(createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
    })));
    await createdPromise;

    // Resize should not throw (no response expected)
    ws.send(JSON.stringify(createMessage(MessageType.TERMINAL_RESIZE, {
      sessionId: 'sess-1',
      cols: 120,
      rows: 40,
    })));

    // Give it a moment - no error means success
    await new Promise(r => setTimeout(r, 50));
  });

  it('cleans up sessions on client disconnect', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);

    // Create terminal
    const createdPromise = waitForMessage(ws, MessageType.TERMINAL_CREATED);
    ws.send(JSON.stringify(createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
    })));
    await createdPromise;

    // Close connection
    ws.close();

    // Wait for cleanup
    await new Promise(r => setTimeout(r, 100));

    // Verify server is still running (accepts new connections)
    const ws2 = await connectClient(testPort);
    clients.push(ws2);
    expect(ws2.readyState).toBe(WebSocket.OPEN);
  });
});
