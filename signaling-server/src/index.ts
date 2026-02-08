import { WebSocketServer, WebSocket } from 'ws';
import { MessageType } from '@vibepilot/protocol';

export interface SignalingServerOptions {
  port: number;
}

const SIGNALING_TYPES = new Set<string>([
  MessageType.SIGNAL_OFFER,
  MessageType.SIGNAL_ANSWER,
  MessageType.SIGNAL_CANDIDATE,
]);

export class SignalingServer {
  private wss: WebSocketServer | null = null;
  private port: number;

  // roomId -> Set of WebSocket clients
  private rooms = new Map<string, Set<WebSocket>>();

  // WebSocket -> roomId (each client is in at most one room)
  private clientRoom = new Map<WebSocket, string>();

  constructor(options: SignalingServerOptions) {
    this.port = options.port;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        resolve();
      });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      for (const client of this.wss.clients) {
        client.close();
      }

      this.wss.close(() => {
        this.wss = null;
        this.rooms.clear();
        this.clientRoom.clear();
        resolve();
      });
    });
  }

  /**
   * Get the number of clients in a room.
   */
  getRoomSize(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.size : 0;
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(ws, msg);
      } catch {
        // Invalid JSON, ignore
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }

  private handleMessage(ws: WebSocket, msg: any): void {
    if (msg.type === 'room:join') {
      this.handleRoomJoin(ws, msg.payload?.roomId);
      return;
    }

    // Forward signaling messages to other clients in the same room
    if (SIGNALING_TYPES.has(msg.type)) {
      this.forwardToRoom(ws, msg);
      return;
    }
  }

  private handleRoomJoin(ws: WebSocket, roomId: string | undefined): void {
    if (!roomId) return;

    // Leave current room if in one
    const currentRoom = this.clientRoom.get(ws);
    if (currentRoom) {
      this.leaveRoom(ws, currentRoom);
    }

    // Join new room
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(ws);
    this.clientRoom.set(ws, roomId);
  }

  private leaveRoom(ws: WebSocket, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
    this.clientRoom.delete(ws);
  }

  private forwardToRoom(sender: WebSocket, msg: any): void {
    const roomId = this.clientRoom.get(sender);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const msgStr = JSON.stringify(msg);

    for (const client of room) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const roomId = this.clientRoom.get(ws);
    if (roomId) {
      this.leaveRoom(ws, roomId);
    }
  }
}

// Start server if run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = parseInt(process.env.PORT || '9801', 10);
  const server = new SignalingServer({ port });
  server.start().then(() => {
    console.log(`Signaling server listening on port ${port}`);
  });
}
