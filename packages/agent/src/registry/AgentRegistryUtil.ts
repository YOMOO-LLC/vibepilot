import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentMetadata } from '@vibepilot/protocol';

/**
 * Static utility class for agent registration with PostgreSQL
 * Used by Agent to register itself and update heartbeat
 */
export class AgentRegistry {
  static async register(
    supabase: SupabaseClient,
    metadata: Omit<AgentMetadata, 'id' | 'ownerId' | 'createdAt' | 'lastSeen'>
  ): Promise<string> {
    const { data, error } = await supabase
      .from('agents')
      .upsert(
        {
          name: metadata.name,
          platform: metadata.platform,
          version: metadata.version,
          project_path: metadata.projectPath,
          tags: metadata.tags,
          last_seen: new Date().toISOString(),
        },
        {
          onConflict: 'owner_id,name',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single();

    if (error) throw new Error(`Agent registration failed: ${error.message}`);

    return data.id;
  }

  static async updateLastSeen(supabase: SupabaseClient, agentId: string): Promise<void> {
    const { error } = await supabase
      .from('agents')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', agentId);

    if (error) throw new Error(`Failed to update last_seen: ${error.message}`);
  }
}
