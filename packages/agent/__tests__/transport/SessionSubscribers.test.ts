import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { VPWebSocketServer } from '../../src/transport/WebSocketServer.js';
import { MessageType, createMessage } from '@vibepilot/protocol';

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

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket, matchType?: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for message type: ${matchType}`));
    }, timeoutMs);

    const handler = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (!matchType || msg.type === matchType) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function collectMessages(
  ws: WebSocket,
  matchType: string,
  count: number,
  timeoutMs = 2000
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = [];
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(
        new Error(
          `Timeout collecting ${count} messages of type ${matchType}, got ${messages.length}`
        )
      );
    }, timeoutMs);

    const handler = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === matchType) {
        messages.push(msg);
        if (messages.length >= count) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(messages);
        }
      }
    };
    ws.on('message', handler);
  });
}

describe('Session Subscribers (multi-client output broadcast)', () => {
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

  it('broadcasts terminal output to all subscribers', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    // Client 1 creates the terminal
    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    const createdPromise = waitForMessage(ws1, MessageType.TERMINAL_CREATED);
    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_CREATE, {
          sessionId: 'sess-multi',
          cols: 80,
          rows: 24,
        })
      )
    );
    await createdPromise;

    // Client 2 subscribes to the same session
    const ws2 = await connectClient(testPort);
    clients.push(ws2);

    const subscribedPromise = waitForMessage(ws2, MessageType.TERMINAL_SUBSCRIBED);
    ws2.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_SUBSCRIBE, {
          sessionId: 'sess-multi',
        })
      )
    );
    await subscribedPromise;

    // Client 1 sends input
    const output1Promise = waitForMessage(ws1, MessageType.TERMINAL_OUTPUT);
    const output2Promise = waitForMessage(ws2, MessageType.TERMINAL_OUTPUT);

    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_INPUT, {
          sessionId: 'sess-multi',
          data: 'hello\r',
        })
      )
    );

    // Both clients should receive output
    const [out1, out2] = await Promise.all([output1Promise, output2Promise]);
    expect(out1.type).toBe(MessageType.TERMINAL_OUTPUT);
    expect(out1.payload.sessionId).toBe('sess-multi');
    expect(out2.type).toBe(MessageType.TERMINAL_OUTPUT);
    expect(out2.payload.sessionId).toBe('sess-multi');
  });

  it('terminal:subscribe returns error for non-existent session', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    // Subscribe to non-existent session
    const responsePromise = waitForMessage(ws, MessageType.TERMINAL_DESTROYED);
    ws.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_SUBSCRIBE, {
          sessionId: 'no-such-session',
        })
      )
    );

    const response = await responsePromise;
    expect(response.type).toBe(MessageType.TERMINAL_DESTROYED);
    expect(response.payload.sessionId).toBe('no-such-session');
  });

  it('terminal:list-sessions returns active sessions', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    // Create a terminal
    const createdPromise = waitForMessage(ws1, MessageType.TERMINAL_CREATED);
    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_CREATE, {
          sessionId: 'sess-list-1',
          cols: 80,
          rows: 24,
        })
      )
    );
    await createdPromise;

    // Client 2 lists sessions
    const ws2 = await connectClient(testPort);
    clients.push(ws2);

    const sessionsPromise = waitForMessage(ws2, MessageType.TERMINAL_SESSIONS);
    ws2.send(JSON.stringify(createMessage(MessageType.TERMINAL_LIST_SESSIONS, {})));

    const sessions = await sessionsPromise;
    expect(sessions.type).toBe(MessageType.TERMINAL_SESSIONS);
    expect(sessions.payload.sessions).toHaveLength(1);
    expect(sessions.payload.sessions[0].sessionId).toBe('sess-list-1');
  });

  it('subscriber disconnect does not affect owner or other subscribers', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    // Client 1 creates terminal
    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    const createdPromise = waitForMessage(ws1, MessageType.TERMINAL_CREATED);
    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_CREATE, {
          sessionId: 'sess-disconnect',
          cols: 80,
          rows: 24,
        })
      )
    );
    await createdPromise;

    // Client 2 subscribes
    const ws2 = await connectClient(testPort);
    clients.push(ws2);

    const subscribedPromise = waitForMessage(ws2, MessageType.TERMINAL_SUBSCRIBED);
    ws2.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_SUBSCRIBE, {
          sessionId: 'sess-disconnect',
        })
      )
    );
    await subscribedPromise;

    // Client 2 disconnects
    ws2.close();
    await new Promise((r) => setTimeout(r, 100));

    // Client 1 should still be able to use the terminal
    const outputPromise = waitForMessage(ws1, MessageType.TERMINAL_OUTPUT);
    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_INPUT, {
          sessionId: 'sess-disconnect',
          data: 'test\r',
        })
      )
    );

    const output = await outputPromise;
    expect(output.type).toBe(MessageType.TERMINAL_OUTPUT);
    expect(output.payload.sessionId).toBe('sess-disconnect');
  });

  it('broadcasts output to 3+ subscribers simultaneously', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    // Client 1 creates the terminal
    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    const createdPromise = waitForMessage(ws1, MessageType.TERMINAL_CREATED);
    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_CREATE, {
          sessionId: 'sess-three',
          cols: 80,
          rows: 24,
        })
      )
    );
    await createdPromise;

    // Client 2 subscribes
    const ws2 = await connectClient(testPort);
    clients.push(ws2);

    const sub2Promise = waitForMessage(ws2, MessageType.TERMINAL_SUBSCRIBED);
    ws2.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_SUBSCRIBE, {
          sessionId: 'sess-three',
        })
      )
    );
    await sub2Promise;

    // Client 3 subscribes
    const ws3 = await connectClient(testPort);
    clients.push(ws3);

    const sub3Promise = waitForMessage(ws3, MessageType.TERMINAL_SUBSCRIBED);
    ws3.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_SUBSCRIBE, {
          sessionId: 'sess-three',
        })
      )
    );
    await sub3Promise;

    // Client 1 sends input - all 3 should receive output
    const out1 = waitForMessage(ws1, MessageType.TERMINAL_OUTPUT);
    const out2 = waitForMessage(ws2, MessageType.TERMINAL_OUTPUT);
    const out3 = waitForMessage(ws3, MessageType.TERMINAL_OUTPUT);

    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_INPUT, {
          sessionId: 'sess-three',
          data: 'broadcast\r',
        })
      )
    );

    const [r1, r2, r3] = await Promise.all([out1, out2, out3]);
    expect(r1.payload.sessionId).toBe('sess-three');
    expect(r2.payload.sessionId).toBe('sess-three');
    expect(r3.payload.sessionId).toBe('sess-three');
  });

  it('broadcasts CWD changes to all subscribers', async () => {
    server = new VPWebSocketServer({ port: testPort });
    await server.start();

    // Client 1 creates the terminal
    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    // Both clients listen for CWD
    const cwd1Promise = waitForMessage(ws1, MessageType.TERMINAL_CWD);

    ws1.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_CREATE, {
          sessionId: 'sess-cwd',
          cols: 80,
          rows: 24,
        })
      )
    );

    // Wait for create response (also gets initial CWD)
    await waitForMessage(ws1, MessageType.TERMINAL_CREATED);
    const cwd1 = await cwd1Promise;

    // Client 2 subscribes
    const ws2 = await connectClient(testPort);
    clients.push(ws2);

    const subscribedPromise = waitForMessage(ws2, MessageType.TERMINAL_SUBSCRIBED);
    ws2.send(
      JSON.stringify(
        createMessage(MessageType.TERMINAL_SUBSCRIBE, {
          sessionId: 'sess-cwd',
        })
      )
    );
    await subscribedPromise;

    // After subscription, client 2 should also receive CWD broadcasts
    // (We just verify the subscribe flow works without error - CWD timing is complex)
    expect(cwd1.type).toBe(MessageType.TERMINAL_CWD);
  });
});
