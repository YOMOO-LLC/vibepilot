import { create } from 'zustand';

export interface AgentInfo {
  id: string;
  name: string;
  url: string;
}

interface AgentStore {
  agents: AgentInfo[];
  selectedAgent: AgentInfo | null;
  showSelector: boolean;

  loadAgents: () => void;
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

  loadAgents: () => {
    const agents = loadFromStorage();
    set({ agents });

    if (agents.length === 0) {
      // No agents configured — show selector so user can add one
      set({ showSelector: true });
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
