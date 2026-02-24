'use client';

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { VPWebRTCClient } from './webrtc';

export type ConnectionState =
  | 'idle'
  | 'requesting'
  | 'waiting-ready'
  | 'creating-offer'
  | 'waiting-answer'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'retrying';

const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 3000, // 3 seconds
};

const TIMEOUT_CONFIG = {
  waitReady: 5000, // 5 seconds
  waitAnswer: 10000, // 10 seconds
  waitConnection: 15000, // 15 seconds
};

export class WebRTCSignaling {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  /**
   * Initiate connection (main entry point)
   */
  async connect(
    agentId: string,
    onStateChange: (state: ConnectionState, meta?: any) => void
  ): Promise<VPWebRTCClient> {
    let retries = 0;

    while (retries < RETRY_CONFIG.maxRetries) {
      let client: VPWebRTCClient | null = null;
      try {
        client = new VPWebRTCClient();
        await this.attemptConnection(agentId, client, onStateChange);
        return client;
      } catch (err: any) {
        // Clean up failed client
        if (client) {
          try {
            client.close();
          } catch (closeErr) {
            console.error('[WebRTCSignaling] Failed to close client:', closeErr);
          }
        }

        retries++;
        if (retries < RETRY_CONFIG.maxRetries) {
          onStateChange('retrying', { attempt: retries, maxRetries: RETRY_CONFIG.maxRetries });
          await this.delay(RETRY_CONFIG.retryDelay);
        } else {
          onStateChange('failed', { error: err.message });
          throw err;
        }
      }
    }

    throw new Error('Unreachable');
  }

  /**
   * Attempt one connection (private)
   */
  private async attemptConnection(
    agentId: string,
    client: VPWebRTCClient,
    onStateChange: (state: ConnectionState) => void
  ): Promise<void> {
    onStateChange('requesting');

    // 1. Listen on Presence channel (with broadcast enabled)
    const presenceChannel = this.supabase.channel(`user:${this.userId}:agents`, {
      config: {
        broadcast: { self: false },
      },
    });

    // Subscribe and wait for channel to be ready
    const subscribePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Channel subscription timeout')), 5000);
      presenceChannel.subscribe((status) => {
        console.log('[WebRTCSignaling] Presence channel subscription status:', status);
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await subscribePromise;

    console.log('[WebRTCSignaling] Presence channel state after subscribe:', presenceChannel.state);

    // 2. Send CONNECTION_REQUEST
    console.log('[WebRTCSignaling] Sending CONNECTION_REQUEST to agent:', agentId);
    const sendResult = await presenceChannel.send({
      type: 'broadcast',
      event: 'connection-request',
      payload: { agentId },
    });
    console.log('[WebRTCSignaling] Send result:', sendResult);

    onStateChange('waiting-ready');

    // 3. Wait for READY (5s timeout)
    const ready = await this.waitForReady(presenceChannel, agentId, TIMEOUT_CONFIG.waitReady);
    if (!ready) {
      await presenceChannel.unsubscribe();
      throw new Error('Agent did not respond (timeout waiting for READY)');
    }

    // 4. Create signaling channel (with broadcast enabled)
    const signalingChannel = this.supabase.channel(`agent:${agentId}:signaling`, {
      config: {
        broadcast: { self: false },
      },
    });

    // Subscribe and wait for channel to be ready
    const signalingSubscribePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Signaling channel subscription timeout')),
        5000
      );
      signalingChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await signalingSubscribePromise;

    onStateChange('creating-offer');

    // 5. Create promise that resolves when WebRTC connects
    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('WebRTC connection timeout'));
      }, TIMEOUT_CONFIG.waitConnection);

      // Use the callback to resolve promise
      const stateCallback = (state: string) => {
        if (state === 'connected') {
          clearTimeout(timer);
          onStateChange('connected');
          resolve();
        } else if (state === 'failed') {
          clearTimeout(timer);
          reject(new Error('WebRTC connection failed'));
        }
      };

      // 6. Create and send offer with state callback
      client
        .createOffer(
          // onSignal: Send signaling messages
          (msg) => {
            const event =
              msg.type === 'signal:offer'
                ? 'offer'
                : msg.type === 'signal:candidate'
                  ? 'candidate'
                  : 'unknown';

            console.log(
              `[WebRTCSignaling] Sending ${event} via channel:`,
              signalingChannel.topic,
              msg.payload
            );

            signalingChannel
              .send({
                type: 'broadcast',
                event,
                payload: msg.payload,
              })
              .then((result) => {
                console.log(`[WebRTCSignaling] ${event} sent successfully:`, result);
              })
              .catch((err) => {
                console.error(`[WebRTCSignaling] Failed to send ${event}:`, err);
              });
          },
          // onStateChange: WebRTC state changes
          stateCallback
        )
        .catch(reject);
    });

    onStateChange('waiting-answer');

    // 7. Wait for answer (10s timeout)
    const answer = await this.waitForAnswer(signalingChannel, TIMEOUT_CONFIG.waitAnswer);
    if (!answer) {
      await signalingChannel.unsubscribe();
      await presenceChannel.unsubscribe();
      throw new Error('No answer received from agent');
    }

    await client.handleAnswer(answer.sdp);

    onStateChange('connecting');

    // 8. Setup ICE exchange
    this.setupIceExchange(client, signalingChannel);

    // 9. Wait for connection using the promise
    await connectionPromise;

    // 10. Cleanup signaling channel
    await signalingChannel.unsubscribe();
    // Keep presence channel open (may be needed by other features)
  }

  /**
   * Wait for READY response (private)
   */
  private async waitForReady(
    channel: RealtimeChannel,
    agentId: string,
    timeout: number
  ): Promise<boolean> {
    console.log('[WebRTCSignaling] waitForReady: Initial channel state:', channel.state);

    // Monitor channel state changes
    const stateInterval = setInterval(() => {
      console.log('[WebRTCSignaling] waitForReady: Channel state during wait:', channel.state);
    }, 1000);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        clearInterval(stateInterval);
        console.log('[WebRTCSignaling] waitForReady: Timeout, final channel state:', channel.state);
        resolve(false);
      }, timeout);

      const subscription = (channel as any).on(
        'broadcast',
        { event: 'connection-ready' },
        (msg: { payload: { agentId: string } }) => {
          console.log('[WebRTCSignaling] Received connection-ready:', msg);
          if (msg.payload.agentId === agentId) {
            clearTimeout(timer);
            clearInterval(stateInterval);
            subscription.unsubscribe();
            resolve(true);
          }
        }
      );
    });
  }

  /**
   * Wait for answer (private)
   */
  private async waitForAnswer(
    channel: RealtimeChannel,
    timeout: number
  ): Promise<{ sdp: string } | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeout);

      const subscription = (channel as any).on(
        'broadcast',
        { event: 'answer' },
        (msg: { payload: { sdp: string } }) => {
          console.log('[WebRTCSignaling] Received answer');
          clearTimeout(timer);
          subscription.unsubscribe();
          resolve(msg.payload);
        }
      );
    });
  }

  /**
   * Setup ICE exchange (private)
   */
  private setupIceExchange(client: VPWebRTCClient, channel: RealtimeChannel): void {
    // Listen for channel's ICE candidates
    (channel as any).on(
      'broadcast',
      { event: 'candidate' },
      (msg: { payload: { candidate: string; sdpMid?: string; sdpMLineIndex?: number } }) => {
        client
          .addIceCandidate(msg.payload.candidate, msg.payload.sdpMid, msg.payload.sdpMLineIndex)
          .catch((err) => {
            console.error('[WebRTCSignaling] Failed to add ICE candidate:', err);
          });
      }
    );
  }

  /**
   * Delay helper (private)
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
