import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { AgentPresence } from '@vibepilot/protocol';

/**
 * RealtimePresence: Broadcasts agent online/offline status via Supabase Realtime Presence
 *
 * Features:
 * - Channel: `user:{userId}:agents`
 * - Presence key: `agentId`
 * - Heartbeat: every 30 seconds
 * - Field mapping: camelCase → snake_case
 *
 * Lifecycle:
 * 1. announceOnline() → subscribe + track
 * 2. startHeartbeat() → periodic track (30s interval)
 * 3. announceOffline() → untrack + unsubscribe + clearInterval
 */
export class RealtimePresence {
  private channel: RealtimeChannel | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  /**
   * Get the presence channel (must call announceOnline first)
   */
  getChannel(): RealtimeChannel | null {
    return this.channel;
  }

  /**
   * Announce agent online status and start heartbeat
   *
   * @param agentId - Agent identifier (used as presence key)
   * @param metadata - Agent presence metadata (AgentPresence)
   */
  async announceOnline(agentId: string, metadata: AgentPresence): Promise<void> {
    // Create channel with presence AND broadcast enabled
    this.channel = this.supabase.channel(`user:${this.userId}:agents`, {
      config: {
        presence: {
          key: agentId,
        },
        broadcast: {
          self: true, // Receive own broadcasts
        },
      },
    });

    // Subscribe to channel
    await this.channel.subscribe();

    // Track initial presence (camelCase → snake_case)
    await this.channel.track({
      agent_id: agentId,
      name: metadata.name,
      platform: metadata.platform,
      public_key: metadata.publicKey,
      online_at: metadata.onlineAt,
    });

    console.log(`[Presence] Announced online: ${agentId}`);

    // Start heartbeat
    this.startHeartbeat(agentId);
  }

  /**
   * Announce agent offline status and cleanup
   */
  async announceOffline(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Untrack presence and unsubscribe
    if (this.channel) {
      await this.channel.untrack();
      await this.channel.unsubscribe();
      this.channel = null;
    }

    console.log('[Presence] Announced offline');
  }

  /**
   * Start heartbeat timer (30 second interval)
   *
   * Heartbeat payload is minimal (only agent_id + heartbeat_at) to reduce bandwidth
   */
  private startHeartbeat(agentId: string): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.channel) {
        await this.channel.track({
          agent_id: agentId,
          heartbeat_at: new Date().toISOString(),
        });
      }
    }, 30000); // 30 seconds
  }
}
