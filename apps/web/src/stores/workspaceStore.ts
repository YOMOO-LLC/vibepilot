import { create } from 'zustand';

export type ActivePane =
  | { kind: 'terminal'; id: string }
  | { kind: 'editor'; id: string }
  | null;

interface WorkspaceStore {
  activePane: ActivePane;
  setActivePane: (pane: ActivePane) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activePane: null,

  setActivePane: (pane: ActivePane) => {
    set({ activePane: pane });
  },
}));
