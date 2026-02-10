import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

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
