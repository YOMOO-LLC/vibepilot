import { create } from 'zustand';

export type LayoutMode = 'single' | 'horizontal' | 'vertical' | 'quad';

export interface TerminalTab {
  id: string;
  title: string;
  sessionId: string;
}

interface TerminalStore {
  tabs: TerminalTab[];
  activeTabId: string | null;
  layout: LayoutMode;
  counter: number;
  cwdMap: Record<string, string>;

  createTab: (title?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setLayout: (layout: LayoutMode) => void;
  renameTab: (id: string, title: string) => void;
  setCwd: (sessionId: string, cwd: string) => void;
  nextTab: () => void;
  prevTab: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  layout: 'single',
  counter: 0,
  cwdMap: {},

  createTab: (title?: string) => {
    const { counter } = get();
    const newCounter = counter + 1;
    const id = `tab-${Date.now()}-${newCounter}`;
    const tab: TerminalTab = {
      id,
      title: title || `Terminal ${newCounter}`,
      sessionId: id,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
      counter: newCounter,
    }));
  },

  closeTab: (id: string) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const closedTab = state.tabs.find((t) => t.id === id);
      const newTabs = state.tabs.filter((t) => t.id !== id);

      let newActive = state.activeTabId;
      if (state.activeTabId === id) {
        if (newTabs.length === 0) {
          newActive = null;
        } else if (idx >= newTabs.length) {
          newActive = newTabs[newTabs.length - 1].id;
        } else {
          newActive = newTabs[idx].id;
        }
      }

      const newCwdMap = { ...state.cwdMap };
      if (closedTab) {
        delete newCwdMap[closedTab.sessionId];
      }

      return { tabs: newTabs, activeTabId: newActive, cwdMap: newCwdMap };
    });
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id });
  },

  setLayout: (layout: LayoutMode) => {
    set({ layout });
  },

  renameTab: (id: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  setCwd: (sessionId: string, cwd: string) => {
    set((state) => ({
      cwdMap: { ...state.cwdMap, [sessionId]: cwd },
    }));
  },

  nextTab: () => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + 1) % tabs.length;
    set({ activeTabId: tabs[nextIdx].id });
  },

  prevTab: () => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prevIdx = (idx - 1 + tabs.length) % tabs.length;
    set({ activeTabId: tabs[prevIdx].id });
  },
}));
