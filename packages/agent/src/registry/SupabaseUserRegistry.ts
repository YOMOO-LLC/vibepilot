import { decodeJwt } from 'jose';
import type { AgentInfo, AgentRegistration, AgentRegistry } from './AgentRegistry.js';

/**
 * Supabase agent registry using user JWT (anon key + access token).
 *
 * Key difference from SupabaseRegistry (service_role key):
 *   SupabaseRegistry:     apikey: serviceKey,  Authorization: Bearer serviceKey
 *   SupabaseUserRegistry: apikey: anonKey,     Authorization: Bearer userJwt
 *
 * RLS policies on the agents table use `auth.uid()` to enforce `owner_id` matching,
 * so the user JWT is sufficient for all operations without a service_role key.
 */
export class SupabaseUserRegistry implements AgentRegistry {
  private supabaseUrl: string;
  private anonKey: string;
  private userAccessToken: string;
  private userId: string;

  constructor(supabaseUrl: string, anonKey: string, userAccessToken: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');
    this.anonKey = anonKey;
    this.userAccessToken = userAccessToken;

    // Extract userId at construction time so we fail fast
    const payload = decodeJwt(userAccessToken);
    if (!payload.sub) {
      throw new Error('JWT missing sub claim — cannot determine owner_id');
    }
    this.userId = payload.sub;
  }

  async register(input: AgentRegistration): Promise<AgentInfo> {
    const response = await this.request('/rest/v1/agents?on_conflict=owner_id,public_url', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        name: input.name,
        public_url: input.publicUrl,
        owner_id: this.userId, // Always from JWT, ignoring input.ownerId
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
      apikey: this.anonKey,
      Authorization: `Bearer ${this.userAccessToken}`,
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
