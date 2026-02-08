/**
 * Metadata for a registered VibePilot agent.
 */
export interface AgentInfo {
  id: string;
  name: string;
  publicUrl: string;
  ownerId: string;
  status: 'online' | 'offline';
  lastSeen: number;
  version?: string;
  platform?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for registering a new agent (id and lastSeen are auto-generated).
 */
export type AgentRegistration = Omit<AgentInfo, 'id' | 'lastSeen' | 'status'>;

/**
 * Pluggable agent registry interface.
 *
 * Implementations:
 * - FileSystemRegistry: JSON file storage (single-user mode)
 * - PostgresRegistry: PostgreSQL storage (multi-user mode)
 * - SupabaseRegistry: Supabase integration (cloud mode)
 */
export interface AgentRegistry {
  /**
   * Register an agent. If the same publicUrl+ownerId already exists,
   * update the existing record and mark it online.
   */
  register(agent: AgentRegistration): Promise<AgentInfo>;

  /**
   * Update the lastSeen timestamp for an agent.
   */
  heartbeat(agentId: string): Promise<void>;

  /**
   * Mark an agent as offline.
   */
  unregister(agentId: string): Promise<void>;

  /**
   * List all agents belonging to a specific owner.
   */
  listByOwner(ownerId: string): Promise<AgentInfo[]>;

  /**
   * Get a single agent by ID.
   */
  get(agentId: string): Promise<AgentInfo | null>;
}
