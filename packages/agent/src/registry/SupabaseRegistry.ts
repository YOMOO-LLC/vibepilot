import type { AgentInfo, AgentRegistration, AgentRegistry } from './AgentRegistry.js';

/**
 * Supabase-based agent registry.
 *
 * Uses the Supabase REST API (PostgREST) to manage agent records.
 * Requires a service key for write operations (register/heartbeat/unregister).
 * RLS policies on the agents table ensure user isolation.
 */
export class SupabaseRegistry implements AgentRegistry {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');
    this.supabaseKey = supabaseKey;
  }

  async register(input: AgentRegistration): Promise<AgentInfo> {
    // Upsert: if same public_url + owner_id exists, update it
    const response = await this.request('/rest/v1/agents?on_conflict=owner_id,public_url', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        name: input.name,
        public_url: input.publicUrl,
        owner_id: input.ownerId,
        status: 'online',
        last_seen: new Date().toISOString(),
        version: input.version || null,
        platform: input.platform || null,
        metadata: input.metadata || {},
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to register agent: ${response.status} ${text}`);
    }

    const rows = (await response.json()) as any[];
    return this.toAgentInfo(rows[0]);
  }

  async heartbeat(agentId: string): Promise<void> {
    const response = await this.request(`/rest/v1/agents?id=eq.${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        last_seen: new Date().toISOString(),
        status: 'online',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Heartbeat failed: ${response.status} ${text}`);
    }
  }

  async unregister(agentId: string): Promise<void> {
    const response = await this.request(`/rest/v1/agents?id=eq.${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'offline',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Unregister failed: ${response.status} ${text}`);
    }
  }

  async listByOwner(ownerId: string): Promise<AgentInfo[]> {
    const response = await this.request(
      `/rest/v1/agents?owner_id=eq.${ownerId}&order=last_seen.desc`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`List agents failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as any[];
    return data.map((row: any) => this.toAgentInfo(row));
  }

  async get(agentId: string): Promise<AgentInfo | null> {
    const response = await this.request(`/rest/v1/agents?id=eq.${agentId}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.pgrst.object+json',
      },
    });

    if (response.status === 406) {
      // Not found (PostgREST returns 406 for empty singular result)
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;
    return this.toAgentInfo(data);
  }

  private async request(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string }
  ): Promise<Response> {
    const url = `${this.supabaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.supabaseKey,
      Authorization: `Bearer ${this.supabaseKey}`,
      ...init.headers,
    };

    return fetch(url, {
      method: init.method,
      headers,
      body: init.body,
    });
  }

  private toAgentInfo(row: any): AgentInfo {
    return {
      id: row.id,
      name: row.name,
      publicUrl: row.public_url,
      ownerId: row.owner_id,
      status: row.status,
      lastSeen: new Date(row.last_seen).getTime(),
      version: row.version || undefined,
      platform: row.platform || undefined,
      metadata: row.metadata || undefined,
    };
  }
}
