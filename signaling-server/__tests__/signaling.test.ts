import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { SignalingServer } from '../src/index.js';
import { MessageType, createMessage } from '@vibepilot/protocol';

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

describe('SignalingServer', () => {
  let server: SignalingServer;
  let testPort: number;
  let clients: WebSocket[];

  beforeEach(() => {
    testPort = 29800 + Math.floor(Math.random() * 1000);
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
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws = await connectClient(testPort);
    clients.push(ws);

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('allows clients to join a room', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    // Join a room by sending a join message
    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));

    // Give it time to process
    await new Promise((r) => setTimeout(r, 50));

    // Server should track this client in room-1
    expect(server.getRoomSize('room-1')).toBe(1);
  });

  it('forwards signal:offer to the other client in the room', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    const ws2 = await connectClient(testPort);
    clients.push(ws1, ws2);

    // Both join the same room
    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));
    ws2.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));

    await new Promise((r) => setTimeout(r, 50));

    // ws1 sends an offer, ws2 should receive it
    const receivePromise = waitForMessage(ws2, MessageType.SIGNAL_OFFER);

    const offerMsg = createMessage(MessageType.SIGNAL_OFFER, {
      sdp: 'v=0\r\noffer-sdp\r\n',
    });
    ws1.send(JSON.stringify(offerMsg));

    const received = await receivePromise;
    expect(received.type).toBe(MessageType.SIGNAL_OFFER);
    expect(received.payload.sdp).toBe('v=0\r\noffer-sdp\r\n');
  });

  it('forwards signal:answer to the other client in the room', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    const ws2 = await connectClient(testPort);
    clients.push(ws1, ws2);

    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));
    ws2.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));

    await new Promise((r) => setTimeout(r, 50));

    // ws2 sends an answer, ws1 should receive it
    const receivePromise = waitForMessage(ws1, MessageType.SIGNAL_ANSWER);

    const answerMsg = createMessage(MessageType.SIGNAL_ANSWER, {
      sdp: 'v=0\r\nanswer-sdp\r\n',
    });
    ws2.send(JSON.stringify(answerMsg));

    const received = await receivePromise;
    expect(received.type).toBe(MessageType.SIGNAL_ANSWER);
    expect(received.payload.sdp).toBe('v=0\r\nanswer-sdp\r\n');
  });

  it('forwards signal:candidate to the other client in the room', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    const ws2 = await connectClient(testPort);
    clients.push(ws1, ws2);

    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));
    ws2.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));

    await new Promise((r) => setTimeout(r, 50));

    const receivePromise = waitForMessage(ws2, MessageType.SIGNAL_CANDIDATE);

    const candidateMsg = createMessage(MessageType.SIGNAL_CANDIDATE, {
      candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
    ws1.send(JSON.stringify(candidateMsg));

    const received = await receivePromise;
    expect(received.type).toBe(MessageType.SIGNAL_CANDIDATE);
    expect(received.payload.candidate).toBe('candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host');
  });

  it('cleans up room when client disconnects', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    const ws2 = await connectClient(testPort);
    clients.push(ws2); // only keep ws2 for cleanup

    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));
    ws2.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-1' } }));

    await new Promise((r) => setTimeout(r, 50));
    expect(server.getRoomSize('room-1')).toBe(2);

    ws1.close();

    await new Promise((r) => setTimeout(r, 100));
    expect(server.getRoomSize('room-1')).toBe(1);
  });

  it('removes empty rooms on disconnect', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);

    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-cleanup' } }));

    await new Promise((r) => setTimeout(r, 50));
    expect(server.getRoomSize('room-cleanup')).toBe(1);

    ws1.close();

    await new Promise((r) => setTimeout(r, 100));
    expect(server.getRoomSize('room-cleanup')).toBe(0);
  });

  it('does not forward messages to sender', async () => {
    server = new SignalingServer({ port: testPort });
    await server.start();

    const ws1 = await connectClient(testPort);
    clients.push(ws1);

    ws1.send(JSON.stringify({ type: 'room:join', payload: { roomId: 'room-solo' } }));
    await new Promise((r) => setTimeout(r, 50));

    // Send an offer - should not bounce back
    const offerMsg = createMessage(MessageType.SIGNAL_OFFER, {
      sdp: 'v=0\r\noffer-sdp\r\n',
    });
    ws1.send(JSON.stringify(offerMsg));

    // Wait briefly - no message should arrive
    const received = await Promise.race([
      waitForMessage(ws1, MessageType.SIGNAL_OFFER),
      new Promise((resolve) => setTimeout(() => resolve(null), 200)),
    ]);

    expect(received).toBeNull();
  });
});
