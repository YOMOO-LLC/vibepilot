import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { VPWebRTCClient } from '@/lib/webrtc';

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'none';

export interface AgentInfo {
  id: string;
  name: string;
  url: string;
}

interface AgentStore {
  agents: AgentInfo[];
  selectedAgent: AgentInfo | null;
  showSelector: boolean;
  loading: boolean;

  loadAgents: () => Promise<void>;
  addAgent: (name: string, url: string) => AgentInfo;
  removeAgent: (agentId: string) => void;
  selectAgent: (agentId: string) => void;
  restoreLastAgent: () => boolean;
  openSelector: () => void;
  closeSelector: () => void;
}

const STORAGE_KEY = 'vp:agents';
const LAST_AGENT_KEY = 'vp:lastAgentId';

function loadFromStorage(): AgentInfo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(agents: AgentInfo[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  selectedAgent: null,
  showSelector: false,
  loading: false,

  loadAgents: async () => {
    if (AUTH_MODE === 'supabase' && supabase) {
      // Supabase mode: fetch from agents table (RLS filters by auth.uid())
      set({ loading: true });
      try {
        const { data, error } = await supabase
          .from('agents')
          .select('id, name, public_url, status')
          .eq('status', 'online')
          .order('last_seen', { ascending: false });

        if (error) {
          console.error('Failed to load agents from Supabase:', error);
          set({ loading: false, showSelector: true });
          return;
        }

        const agents: AgentInfo[] = (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          url: row.public_url,
        }));

        set({ agents, loading: false });

        if (agents.length === 1) {
          // Auto-select the only agent
          set({ selectedAgent: agents[0], showSelector: false });
          if (typeof window !== 'undefined') {
            localStorage.setItem(LAST_AGENT_KEY, agents[0].id);
          }
        } else if (agents.length > 1) {
          // Try to restore last selection
          const lastId =
            typeof window !== 'undefined' ? localStorage.getItem(LAST_AGENT_KEY) : null;
          const last = lastId ? agents.find((a) => a.id === lastId) : null;
          if (last) {
            set({ selectedAgent: last });
          } else {
            set({ showSelector: true });
          }
        } else {
          set({ showSelector: true });
        }
      } catch (err) {
        console.error('Failed to load agents:', err);
        set({ loading: false, showSelector: true });
      }
    } else {
      // Token/local mode: load from localStorage
      const agents = loadFromStorage();
      set({ agents });

      if (agents.length === 0) {
        set({ showSelector: true });
      }
    }
  },

  addAgent: (name: string, url: string): AgentInfo => {
    const agent: AgentInfo = {
      id: crypto.randomUUID(),
      name,
      url,
    };
    const agents = [...get().agents, agent];
    set({ agents });
    saveToStorage(agents);
    return agent;
  },

  removeAgent: (agentId: string) => {
    const agents = get().agents.filter((a) => a.id !== agentId);
    set({ agents });
    saveToStorage(agents);

    // If removed the selected agent, clear selection
    if (get().selectedAgent?.id === agentId) {
      set({ selectedAgent: null });
    }
  },

  selectAgent: (agentId: string) => {
    const agent = get().agents.find((a) => a.id === agentId);
    if (!agent) return;

    set({ selectedAgent: agent, showSelector: false });

    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_AGENT_KEY, agentId);
    }
  },

  restoreLastAgent: (): boolean => {
    if (typeof window === 'undefined') return false;

    const lastId = localStorage.getItem(LAST_AGENT_KEY);
    if (!lastId) return false;

    const agent = get().agents.find((a) => a.id === lastId);
    if (!agent) return false;

    set({ selectedAgent: agent });
    return true;
  },

  openSelector: () => set({ showSelector: true }),
  closeSelector: () => set({ showSelector: false }),
}));

// New Cloud mode agent type (with Realtime Presence)
interface Agent {
  id: string;
  name: string;
  platform: string;
  version?: string;
  projectPath?: string;
  tags?: string[];
  lastSeen: string;
  online: boolean;
  publicKey?: string;
}

// New Cloud mode store (with Realtime Presence)
interface CloudAgentStore {
  agents: Agent[];
  presenceChannel: RealtimeChannel | null;
  supabase: SupabaseClient | null;
  activeClient: VPWebRTCClient | null;
  selectedAgentId: string | null;

  initialize: () => Promise<void>;
  selectAgent: (agentId: string) => Promise<void>;
  disconnect: () => void;
}

// New Cloud mode store with Realtime Presence (for NAT traversal feature)
export const agentStore = create<CloudAgentStore>((set, get) => ({
  agents: [],
  presenceChannel: null,
  supabase: null,
  activeClient: null,
  selectedAgentId: null,

  initialize: async () => {
    if (!supabase) {
      console.warn('Supabase client not available');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      console.warn('No active session');
      return;
    }

    // 1. Load persisted agents from PostgreSQL
    const { data: persistedAgents } = await supabase
      .from('agents')
      .select('*')
      .order('last_seen', { ascending: false });

    set({
      supabase,
      agents: (persistedAgents || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        platform: a.platform,
        version: a.version,
        projectPath: a.project_path,
        tags: a.tags,
        lastSeen: a.last_seen,
        online: false,
        publicKey: a.public_key,
      })),
    });

    // 2. Subscribe to Realtime Presence
    const channel = supabase.channel(`user:${session.user.id}:agents`, {
      config: {
        presence: { key: session.user.id },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineAgentIds = new Set<string>();

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((p) => onlineAgentIds.add(p.agent_id));
        });

        set((state) => ({
          agents: state.agents.map((a) => ({
            ...a,
            online: onlineAgentIds.has(a.id),
          })),
        }));
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('Agent joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('Agent left:', leftPresences);
      })
      .subscribe();

    set({ presenceChannel: channel });
  },

  disconnect: () => {
    const { activeClient } = get();
    if (activeClient) {
      try {
        activeClient.close();
        console.log('[agentStore] Disconnected WebRTC client');
      } catch (err) {
        console.error('[agentStore] Failed to close client:', err);
      }
      set({ activeClient: null, selectedAgentId: null });
    }
  },

  selectAgent: async (agentId: string) => {
    const { supabase, agents, activeClient, selectedAgentId } = get();

    // Disconnect previous connection if exists
    if (activeClient && selectedAgentId !== agentId) {
      console.log('[agentStore] Disconnecting previous agent:', selectedAgentId);
      get().disconnect();
    }

    if (!supabase) {
      console.error('[agentStore] No Supabase client available');
      return;
    }

    // 获取 session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      console.error('[agentStore] No active session');
      return;
    }

    // 查找 agent
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      console.error('[agentStore] Agent not found:', agentId);
      return;
    }

    // 检查 agent 是否在线
    if (!agent.online) {
      console.warn('[agentStore] Agent is offline:', agentId);
      // TODO: 显示 toast 通知用户
      return;
    }

    console.log('[agentStore] Initiating WebRTC connection to agent:', agentId);

    // 初始化 WebRTC 信令
    const { WebRTCSignaling } = await import('@/lib/webrtc-signaling');
    const signaling = new WebRTCSignaling(supabase, session.user.id);

    try {
      const client = await signaling.connect(agentId, (state, meta) => {
        console.log('[agentStore] Connection state:', state, meta);
        // TODO: 更新 UI 状态（显示连接进度）
      });

      console.log('[agentStore] WebRTC connection established');

      // Store client and agent ID
      set({ activeClient: client, selectedAgentId: agentId });
    } catch (err: any) {
      console.error('[agentStore] WebRTC connection failed:', err.message);
      set({ activeClient: null, selectedAgentId: null });
      // TODO: 显示错误 toast
    }
  },
}));
