'use client';

import { MessageType, type MessageTypeValue, type VPMessage } from '@vibepilot/protocol';
import { wsClient, type ConnectionState, type MessageHandler } from '@/lib/websocket';
import { VPWebRTCClient, type WebRTCState } from '@/lib/webrtc';

export type TransportType = 'websocket' | 'webrtc';

// Message types that should prefer WebRTC "terminal-io" channel
const TERMINAL_TYPES: Set<string> = new Set([
  MessageType.TERMINAL_INPUT,
  MessageType.TERMINAL_OUTPUT,
]);

// Message types that should prefer WebRTC "file-transfer" channel
const FILE_TRANSFER_TYPES: Set<string> = new Set([
  MessageType.IMAGE_START,
  MessageType.IMAGE_CHUNK,
  MessageType.IMAGE_COMPLETE,
]);

// Message types that should prefer WebRTC "browser-stream" channel
const BROWSER_STREAM_TYPES: Set<string> = new Set([
  MessageType.BROWSER_FRAME,
  MessageType.BROWSER_FRAME_ACK,
  MessageType.BROWSER_INPUT,
  MessageType.BROWSER_CURSOR,
  MessageType.BROWSER_RESIZE,
]);

export class TransportManager {
  private rtcClient: VPWebRTCClient;
  private _activeTransport: TransportType = 'websocket';
  private onWsStateChange?: (state: ConnectionState) => void;
  private onRtcStateChange?: (state: WebRTCState) => void;
  private onTransportChange?: (transport: TransportType) => void;
  private signalingCleanups: (() => void)[] = [];

  constructor() {
    this.rtcClient = new VPWebRTCClient();
  }

  get activeTransport(): TransportType {
    return this._activeTransport;
  }

  connect(
    wsUrl: string,
    onWsStateChange?: (state: ConnectionState) => void,
    onRtcStateChange?: (state: WebRTCState) => void,
    onTransportChange?: (transport: TransportType) => void
  ): void {
    this.onWsStateChange = onWsStateChange;
    this.onRtcStateChange = onRtcStateChange;
    this.onTransportChange = onTransportChange;

    // Clean up previous signaling handlers to avoid duplicates
    for (const cleanup of this.signalingCleanups) cleanup();
    this.signalingCleanups = [];

    // Listen for signaling messages from WS to forward to WebRTC
    this.signalingCleanups.push(
      wsClient.on(MessageType.SIGNAL_ANSWER, (msg: VPMessage) => {
        const payload = msg.payload as { sdp: string };
        this.rtcClient.handleAnswer(payload.sdp);
      })
    );

    this.signalingCleanups.push(
      wsClient.on(MessageType.SIGNAL_CANDIDATE, (msg: VPMessage) => {
        const payload = msg.payload as {
          candidate: string;
          sdpMid?: string;
          sdpMLineIndex?: number;
        };
        this.rtcClient.addIceCandidate(payload.candidate, payload.sdpMid, payload.sdpMLineIndex);
      })
    );

    // Connect WebSocket first (always available immediately)
    wsClient.connect(wsUrl, (state) => {
      this.onWsStateChange?.(state);

      // When WS is connected, attempt WebRTC upgrade in the background
      if (state === 'connected') {
        this.attemptWebRTCUpgrade();
      }
    });
  }

  send(type: MessageTypeValue, payload: any): void {
    // Try WebRTC for terminal and file-transfer types, with WS fallback
    if (TERMINAL_TYPES.has(type) && this.rtcClient.state === 'connected') {
      try {
        this.rtcClient.send('terminal-io', type, payload);
        return;
      } catch {
        // DataChannel not open, fall through to WS
      }
    }

    if (FILE_TRANSFER_TYPES.has(type) && this.rtcClient.state === 'connected') {
      try {
        this.rtcClient.send('file-transfer', type, payload);
        return;
      } catch {
        // DataChannel not open, fall through to WS
      }
    }

    if (BROWSER_STREAM_TYPES.has(type) && this.rtcClient.state === 'connected') {
      try {
        this.rtcClient.send('browser-stream', type, payload);
        return;
      } catch {
        // DataChannel not open, fall through to WS
      }
    }

    // All other messages or fallback: use WebSocket
    wsClient.send(type, payload);
  }

  on(type: string, handler: MessageHandler): () => void {
    // Register on both transports to receive from either
    const wsUnsub = wsClient.on(type, handler);
    const rtcUnsub = this.rtcClient.on(type, handler);

    return () => {
      wsUnsub();
      rtcUnsub();
    };
  }

  disconnect(): void {
    wsClient.disconnect();
    this.rtcClient.close();
    this.setActiveTransport('websocket');
  }

  private attemptWebRTCUpgrade(): void {
    this.rtcClient.createOffer(
      // onSignal: send signaling messages through WebSocket
      (msg: VPMessage) => {
        try {
          wsClient.send(msg.type as MessageTypeValue, msg.payload);
        } catch {
          // WS not available, WebRTC upgrade will fail gracefully
        }
      },
      // onStateChange: track WebRTC connection state
      (state: WebRTCState) => {
        this.onRtcStateChange?.(state);

        if (state === 'connected') {
          this.setActiveTransport('webrtc');
        } else if (state === 'failed' || state === 'disconnected') {
          this.setActiveTransport('websocket');
        }
      }
    );
  }

  private setActiveTransport(transport: TransportType): void {
    this._activeTransport = transport;
    this.onTransportChange?.(transport);
  }
}

// Singleton — use globalThis to prevent Turbopack module duplication
const TM_KEY = Symbol.for('vp-transport-manager');
const g = globalThis as any;
if (!g[TM_KEY]) {
  g[TM_KEY] = new TransportManager();
}
export const transportManager: TransportManager = g[TM_KEY];
