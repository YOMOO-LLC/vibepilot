import { EventEmitter } from 'events';
import { PeerConnection } from 'node-datachannel';
import { type VPMessage, parseMessage } from '@vibepilot/protocol';

export interface WebRTCPeerOptions {
  iceServers?: string[];
}

interface DataChannelWrapper {
  dc: any;
  label: string;
  isOpen: boolean;
}

export class WebRTCPeer extends EventEmitter {
  private pc: any;
  private channels = new Map<string, DataChannelWrapper>();
  private closed = false;

  constructor(options?: WebRTCPeerOptions) {
    super();

    const iceServers = options?.iceServers ?? ['stun:stun.l.google.com:19302'];

    this.pc = new PeerConnection('agent-peer', {
      iceServers,
    } as any);

    this.setupPeerConnectionCallbacks();
  }

  private setupPeerConnectionCallbacks(): void {
    this.pc.onStateChange((state: string) => {
      if (state === 'connected') {
        this.emit('connected');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.emit('disconnected');
      }
    });

    this.pc.onLocalCandidate((candidate: string, mid: string) => {
      this.emit('candidate', candidate, mid);
    });

    this.pc.onDataChannel((dc: any) => {
      this.registerDataChannel(dc);
    });
  }

  private registerDataChannel(dc: any): void {
    const label = dc.getLabel();
    const wrapper: DataChannelWrapper = {
      dc,
      label,
      isOpen: false,
    };

    this.channels.set(label, wrapper);

    dc.onOpen(() => {
      wrapper.isOpen = true;
      this.emit('datachannel-open', label);
    });

    dc.onClosed(() => {
      wrapper.isOpen = false;
      this.emit('datachannel-close', label);
    });

    dc.onMessage((data: string) => {
      try {
        const msg = parseMessage(data);
        this.emit('message', label, msg);
      } catch {
        // Invalid message format, ignore
      }
    });
  }

  /**
   * Handle an incoming SDP offer from the browser.
   * Sets the remote description and returns the answer SDP.
   */
  async handleOffer(sdp: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for local description'));
      }, 10000);

      this.pc.onLocalDescription((answerSdp: string, type: string) => {
        clearTimeout(timeout);
        resolve(answerSdp);
      });

      this.pc.setRemoteDescription(sdp, 'offer');
    });
  }

  /**
   * Add a remote ICE candidate.
   */
  addIceCandidate(candidate: string, mid?: string): void {
    this.pc.addRemoteCandidate(candidate, mid ?? '0');
  }

  /**
   * Send a VPMessage through the specified DataChannel.
   */
  send(channel: string, msg: VPMessage): void {
    const wrapper = this.channels.get(channel);
    if (!wrapper) {
      throw new Error(`DataChannel "${channel}" not found`);
    }
    if (!wrapper.isOpen) {
      throw new Error(`DataChannel "${channel}" is not open`);
    }
    wrapper.dc.sendMessage(JSON.stringify(msg));
  }

  /**
   * Close the peer connection and all data channels.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    for (const [, wrapper] of this.channels) {
      try {
        wrapper.dc.close();
      } catch {
        // Channel may already be closed
      }
    }
    this.channels.clear();

    try {
      this.pc.close();
    } catch {
      // PC may already be closed
    }
  }

  /**
   * Get the state of a specific data channel.
   */
  isChannelOpen(channel: string): boolean {
    const wrapper = this.channels.get(channel);
    return wrapper?.isOpen ?? false;
  }
}
