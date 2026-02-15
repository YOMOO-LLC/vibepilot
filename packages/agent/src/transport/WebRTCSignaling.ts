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
  private presenceChannel: RealtimeChannel | null = null;

  constructor(
    private supabase: SupabaseClient,
    private userId: string,
    private agentId: string
  ) {}

  /**
   * Start listening for connection requests on the given presence channel
   */
  async start(presenceChannel: RealtimeChannel): Promise<void> {
    // Save reference to presence channel
    this.presenceChannel = presenceChannel;

    logger.info({ channelState: presenceChannel.state }, 'WebRTC signaling starting');

    // Subscribe to the channel if not already subscribed
    if (presenceChannel.state !== 'joined') {
      logger.info('Presence channel not joined, subscribing...');
      await presenceChannel.subscribe();
    }

    logger.info('Registering broadcast listener for connection-request');
    (presenceChannel as any).on(
      'broadcast',
      { event: 'connection-request' },
      (msg: { payload: { agentId: string } }) => {
        logger.info({ msg }, 'Received broadcast message!');
        // Extract actual payload from nested structure
        this.handleConnectionRequest(msg.payload).catch((err: any) => {
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

    if (!this.presenceChannel) {
      logger.error('Presence channel not available');
      return;
    }

    // Create temporary signaling channel with broadcast enabled
    const channelName = `agent:${this.agentId}:signaling`;

    // Clean up existing channel if present to avoid conflicts
    const existingChannel = this.signalingChannels.get(channelName);
    if (existingChannel) {
      logger.info({ channelName }, 'Cleaning up existing signaling channel');
      try {
        await existingChannel.unsubscribe();
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Failed to unsubscribe existing channel');
      }
      this.signalingChannels.delete(channelName);
    }

    const signalingChannel = this.supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });
    this.signalingChannels.set(channelName, signalingChannel);

    // Subscribe and wait for channel to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.error(
          { channelState: signalingChannel.state },
          'Signaling channel subscription timeout'
        );
        reject(new Error('Signaling channel subscription timeout'));
      }, 5000);

      logger.info('Subscribing to signaling channel...');
      signalingChannel.subscribe((status, err) => {
        logger.info({ status, err: err?.message }, 'Signaling channel subscription status');
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`Signaling channel ${status}: ${err?.message}`));
        }
      });
    });

    // IMPORTANT: Register offer listener BEFORE sending connection-ready
    // to avoid race condition where offer arrives before listener is ready
    logger.info(
      { channelName, channelTopic: signalingChannel.topic },
      'Registering offer listener'
    );

    (signalingChannel as any).on(
      'broadcast',
      { event: 'offer' },
      (msg: { payload: { sdp: string } }) => {
        logger.info({ msg, channelTopic: signalingChannel.topic }, 'Received offer!');
        this.handleOffer(msg.payload, signalingChannel).catch((err: any) => {
          logger.error({ err }, 'Failed to handle offer');
        });
      }
    );

    // Also listen to ALL broadcast events for debugging
    (signalingChannel as any).on('broadcast', { event: '*' }, (msg: any) => {
      logger.info(
        { event: 'broadcast-wildcard', msg, channelTopic: signalingChannel.topic },
        'Received ANY broadcast message'
      );
    });

    // Send connection-ready on the existing presence channel
    await this.presenceChannel.send({
      type: 'broadcast',
      event: 'connection-ready',
      payload: { agentId: this.agentId },
    });

    logger.info('Sent connection-ready, signaling channel created');

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
      (msg: { payload: { candidate: string; sdpMid?: string } }) => {
        try {
          logger.info({ msg }, 'Received ICE candidate');
          peer.addIceCandidate(msg.payload.candidate, msg.payload.sdpMid);
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
