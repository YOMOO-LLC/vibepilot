/**
 * Agent metadata stored in PostgreSQL agents table
 */
export interface AgentMetadata {
  id: string;
  ownerId: string;
  name: string;
  platform: 'darwin' | 'linux' | 'win32';
  version: string;
  projectPath: string;
  tags?: string[];
  createdAt: string;
  lastSeen: string;
  publicKey?: string;
}

/**
 * Agent presence broadcast via Supabase Realtime
 */
export interface AgentPresence {
  agentId: string;
  name: string;
  platform: 'darwin' | 'linux' | 'win32';
  publicKey?: string;
  onlineAt: string;
}
