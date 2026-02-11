import {
  parseMessage,
  createMessage,
  type VPMessage,
  type MessageTypeValue,
} from '@vibepilot/protocol';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
export type MessageHandler = (msg: VPMessage) => void;

const RECONNECT_DELAY_MS = 3000;

export class VPWebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private globalHandlers = new Set<MessageHandler>();
  private _state: ConnectionState = 'disconnected';
  private onStateChange?: (state: ConnectionState) => void;
  private reconnectUrl: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  get state(): ConnectionState {
    return this._state;
  }

  connect(url: string, onStateChange?: (state: ConnectionState) => void): void {
    // Guard against duplicate connections
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      // Update callback even when reusing existing connection
      this.onStateChange = onStateChange;
      return;
    }

    // Close any stale WS before creating a new one
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.onStateChange = onStateChange;
    this.reconnectUrl = url;
    this.shouldReconnect = true;
    this.setState('connecting');

    this.doConnect(url);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send<T extends MessageTypeValue>(type: T, payload: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[WS] Send failed - not connected, type:', type);
      throw new Error('WebSocket not connected');
    }
    const msg = createMessage(type, payload);
    console.log('[WS] Sending:', type);
    this.ws.send(JSON.stringify(msg));
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  onAny(handler: MessageHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  private doConnect(url: string): void {
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return; // stale instance
      this.setState('connected');
    };

    ws.onclose = () => {
      if (this.ws !== ws) return; // stale instance
      this.setState('disconnected');
      this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return; // stale instance
      try {
        const msg = parseMessage(event.data as string);
        this.dispatch(msg);
      } catch {
        // Invalid message
      }
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.reconnectUrl) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect && this.reconnectUrl) {
        this.setState('connecting');
        this.doConnect(this.reconnectUrl);
      }
    }, RECONNECT_DELAY_MS);
  }

  private dispatch(msg: VPMessage): void {
    // Type-specific handlers
    const typeHandlers = this.handlers.get(msg.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(msg);
      }
    }

    // Global handlers
    for (const handler of this.globalHandlers) {
      handler(msg);
    }
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    this.onStateChange?.(state);
  }
}

// Singleton instance — use globalThis to prevent Turbopack module duplication
const WS_KEY = Symbol.for('vp-ws-client');
const g = globalThis as any;
if (!g[WS_KEY]) {
  g[WS_KEY] = new VPWebSocketClient();
}
export const wsClient: VPWebSocketClient = g[WS_KEY];
