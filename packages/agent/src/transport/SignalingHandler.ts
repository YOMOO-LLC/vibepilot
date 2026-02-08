import {
  MessageType,
  createMessage,
  type VPMessage,
  type SignalOfferPayload,
  type SignalCandidatePayload,
} from '@vibepilot/protocol';
import type { WebRTCPeer } from './WebRTCPeer.js';

export class SignalingHandler {
  private sendFn: ((msg: VPMessage) => void) | null = null;

  constructor(private peer: WebRTCPeer) {
    this.setupPeerCandidateForwarding();
  }

  private setupPeerCandidateForwarding(): void {
    this.peer.on('candidate', (candidate: string, mid: string) => {
      if (this.sendFn) {
        const msg = createMessage(MessageType.SIGNAL_CANDIDATE, {
          candidate,
          sdpMid: mid,
        });
        this.sendFn(msg);
      }
    });
  }

  /**
   * Set a persistent send function for forwarding peer-generated ICE candidates.
   */
  setSendFunction(sendFn: (msg: VPMessage) => void): void {
    this.sendFn = sendFn;
  }

  /**
   * Handle an incoming signaling message.
   * Only processes signal:offer, signal:answer, and signal:candidate messages.
   */
  handleMessage(msg: VPMessage, sendResponse: (msg: VPMessage) => void): void {
    switch (msg.type) {
      case MessageType.SIGNAL_OFFER:
        this.handleOffer(msg.payload as SignalOfferPayload, sendResponse);
        break;

      case MessageType.SIGNAL_ANSWER:
        // Agent normally receives answers only if it initiated the offer.
        // For now, this is a no-op passthrough.
        break;

      case MessageType.SIGNAL_CANDIDATE:
        this.handleCandidate(msg.payload as SignalCandidatePayload);
        break;

      default:
        // Not a signaling message, ignore
        break;
    }
  }

  private async handleOffer(
    payload: SignalOfferPayload,
    sendResponse: (msg: VPMessage) => void
  ): Promise<void> {
    try {
      const answerSdp = await this.peer.handleOffer(payload.sdp);
      const answerMsg = createMessage(MessageType.SIGNAL_ANSWER, {
        sdp: answerSdp,
      });
      sendResponse(answerMsg);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  private handleCandidate(payload: SignalCandidatePayload): void {
    this.peer.addIceCandidate(payload.candidate, payload.sdpMid);
  }

  /**
   * Check if a message type is a signaling message.
   */
  static isSignalingMessage(type: string): boolean {
    return (
      type === MessageType.SIGNAL_OFFER ||
      type === MessageType.SIGNAL_ANSWER ||
      type === MessageType.SIGNAL_CANDIDATE
    );
  }
}
