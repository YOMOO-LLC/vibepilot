import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { WebRTCPeer } from './WebRTCPeer.js';
import { logger } from '../utils/logger.js';

/**
 * WebRTCSignaling: Manages WebRTC signaling via Supabase Realtime channels
 *
 * Features:
 * - Listens for connection-request broadcasts on presence channel
 * - Creates ephemeral signaling channels for SDP/ICE exchange
 * - Integrates with WebRTCPeer for connection establishment
 * - Auto-cleanup: 2 minutes from channel creation
 *
 * Channel naming:
 * - Presence: `user:{userId}:agents` (listens for broadcasts)
 * - Signaling: `agent:{agentId}:signaling` (ephemeral)
 *
 * Message flow:
 * 1. Browser broadcasts connection-request with agentId on presence channel
 * 2. Agent checks if request is for this agent (ignores otherwise)
 * 3. Agent creates signaling channel, sends connection-ready
 * 4. Browser sends offer on signaling channel
 * 5. Agent creates WebRTCPeer, sends answer
 * 6. ICE candidates exchanged until connection established
 * 7. Signaling channel cleaned up after 2 minutes
 */
export class WebRTCSignaling {
  private signalingChannels = new Map<string, RealtimeChannel>();
  private cleanupTimers = new Set<NodeJS.Timeout>();
  private peers = new Map<string, WebRTCPeer>();

  constructor(
    private supabase: SupabaseClient,
    private userId: string,
    private agentId: string
  ) {}

  /**
   * Start listening for connection requests on the given presence channel
   */
  async start(presenceChannel: RealtimeChannel): Promise<void> {
    (presenceChannel as any).on(
      'broadcast',
      { event: 'connection-request' },
      (payload: { agentId: string }) => {
        this.handleConnectionRequest(payload).catch((err: any) => {
          logger.error({ err }, 'Failed to handle connection request');
        });
      }
    );

    logger.info('WebRTC signaling started, listening on presence channel');
  }

  /**
   * Stop listening and cleanup all signaling channels
   */
  async stop(): Promise<void> {
    // Clear all timers
    for (const timer of this.cleanupTimers) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    // Close all peers
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();

    // Unsubscribe all signaling channels
    for (const channel of this.signalingChannels.values()) {
      await channel.unsubscribe();
    }
    this.signalingChannels.clear();

    logger.info('WebRTC signaling stopped');
  }

  /**
   * Handle connection-request broadcast from browser
   */
  private async handleConnectionRequest(payload: { agentId: string }): Promise<void> {
    if (payload.agentId !== this.agentId) {
      // Not for this agent, ignore
      return;
    }

    logger.info({ agentId: this.agentId }, 'Received connection request');

    // Create temporary signaling channel using spec pattern
    const channelName = `agent:${this.agentId}:signaling`;
    const signalingChannel = this.supabase.channel(channelName);
    this.signalingChannels.set(channelName, signalingChannel);

    await signalingChannel.subscribe();

    // Send connection-ready on presence channel
    const presenceChannel = this.supabase.channel(`user:${this.userId}:agents`);
    await presenceChannel.send({
      type: 'broadcast',
      event: 'connection-ready',
      payload: { agentId: this.agentId },
    });

    logger.info('Sent connection-ready, signaling channel created');

    // Listen for offer
    (signalingChannel as any).on('broadcast', { event: 'offer' }, (msg: { sdp: string }) => {
      this.handleOffer(msg, signalingChannel).catch((err: any) => {
        logger.error({ err }, 'Failed to handle offer');
      });
    });

    // Schedule cleanup after 2 minutes
    this.scheduleCleanup(signalingChannel, 120_000);
  }

  /**
   * Handle offer and generate answer
   */
  private async handleOffer(msg: { sdp: string }, channel: RealtimeChannel): Promise<void> {
    logger.info('Received offer, generating answer');

    // Create WebRTCPeer
    const peer = new WebRTCPeer();
    this.peers.set(channel.topic, peer);

    // Handle offer, generate answer
    const answerSdp = await peer.handleOffer(msg.sdp);

    // Send answer
    await channel.send({
      type: 'broadcast',
      event: 'answer',
      payload: { sdp: answerSdp },
    });

    logger.info('Sent answer');

    // Listen for peer's ICE candidates
    peer.on('candidate', (candidate: string, mid: string) => {
      void (channel as any)
        .send({
          type: 'broadcast',
          event: 'candidate',
          payload: { candidate, sdpMid: mid },
        })
        .catch((err: any) => {
          logger.error({ err }, 'Failed to send ICE candidate');
        });
    });

    // Listen for channel's ICE candidates
    (channel as any).on(
      'broadcast',
      { event: 'candidate' },
      (msg: { candidate: string; sdpMid?: string }) => {
        try {
          peer.addIceCandidate(msg.candidate, msg.sdpMid);
        } catch (err: any) {
          logger.error({ err }, 'Failed to add ICE candidate');
        }
      }
    );
  }

  /**
   * Schedule cleanup of signaling channel
   */
  private scheduleCleanup(channel: RealtimeChannel, delay: number): void {
    const timer = setTimeout(async () => {
      await channel.unsubscribe();
      this.signalingChannels.delete(channel.topic);
      this.cleanupTimers.delete(timer);

      // Cleanup corresponding peer
      const peer = this.peers.get(channel.topic);
      if (peer) {
        peer.close();
        this.peers.delete(channel.topic);
      }

      logger.info({ channel: channel.topic }, 'Signaling channel cleaned up');
    }, delay);

    this.cleanupTimers.add(timer);
  }

  /**
   * Test helper: inject mock peer
   */
  _testSetPeer(peer: any): void {
    this.peers.set(`agent:${this.agentId}:signaling`, peer);
  }
}
