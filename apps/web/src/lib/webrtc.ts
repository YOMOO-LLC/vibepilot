'use client';

import { parseMessage, createMessage, type VPMessage, type MessageTypeValue, MessageType } from '@vibepilot/protocol';

export type WebRTCState = 'disconnected' | 'connecting' | 'connected' | 'failed';
export type MessageHandler = (msg: VPMessage) => void;

export class VPWebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private channels = new Map<string, RTCDataChannel>();
  private _state: WebRTCState = 'disconnected';
  private handlers = new Map<string, Set<MessageHandler>>();
  private onStateChange?: (state: WebRTCState) => void;
  private onSignal?: (msg: VPMessage) => void;

  get state(): WebRTCState {
    return this._state;
  }

  async createOffer(
    onSignal: (msg: VPMessage) => void,
    onStateChange?: (state: WebRTCState) => void
  ): Promise<void> {
    this.onStateChange = onStateChange;
    this.onSignal = onSignal;
    this.setState('connecting');

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Create data channels
    const terminalChannel = this.pc.createDataChannel('terminal-io', {
      ordered: true,
      maxRetransmits: 0,
    });
    this.setupDataChannel(terminalChannel);

    const fileTransferChannel = this.pc.createDataChannel('file-transfer', {
      ordered: true,
    });
    this.setupDataChannel(fileTransferChannel);

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const msg = createMessage(MessageType.SIGNAL_CANDIDATE, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid ?? undefined,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
        });
        this.onSignal?.(msg);
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;

      switch (this.pc.connectionState) {
        case 'connected':
          this.setState('connected');
          break;
        case 'failed':
          this.setState('failed');
          break;
        case 'disconnected':
        case 'closed':
          this.setState('disconnected');
          break;
      }
    };

    // Handle incoming data channels (from remote peer)
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    // Create and set local description
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Send offer signal
      const offerMsg = createMessage(MessageType.SIGNAL_OFFER, {
        sdp: offer.sdp!,
      });
      onSignal(offerMsg);
    } catch (err) {
      console.warn('[WebRTC] createOffer failed:', err);
      this.setState('failed');
    }
  }

  async handleAnswer(sdp: string): Promise<void> {
    if (!this.pc) return;
    try {
      const answer = new RTCSessionDescription({ type: 'answer', sdp });
      await this.pc.setRemoteDescription(answer);
    } catch (err) {
      console.warn('[WebRTC] handleAnswer failed:', err);
    }
  }

  async addIceCandidate(
    candidate: string,
    sdpMid?: string,
    sdpMLineIndex?: number
  ): Promise<void> {
    if (!this.pc) return;
    try {
      const iceCandidate = new RTCIceCandidate({
        candidate,
        sdpMid,
        sdpMLineIndex,
      });
      await this.pc.addIceCandidate(iceCandidate);
    } catch (err) {
      console.warn('[WebRTC] addIceCandidate failed:', err);
    }
  }

  send(channel: string, type: MessageTypeValue, payload: any): void {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== 'open') {
      throw new Error(`DataChannel "${channel}" is not open`);
    }

    const msg = createMessage(type, payload);
    dc.send(JSON.stringify(msg));
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

  close(): void {
    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.setState('disconnected');
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.channels.set(channel.label, channel);

    channel.onmessage = (event) => {
      try {
        const msg = parseMessage(event.data as string);
        this.dispatch(msg);
      } catch {
        // Invalid message
      }
    };

    channel.onclose = () => {
      this.channels.delete(channel.label);
    };
  }

  private dispatch(msg: VPMessage): void {
    const typeHandlers = this.handlers.get(msg.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(msg);
      }
    }
  }

  private setState(state: WebRTCState): void {
    this._state = state;
    this.onStateChange?.(state);
  }
}
