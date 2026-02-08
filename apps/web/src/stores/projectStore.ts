import { create } from 'zustand';
import type { ProjectInfo } from '@vibepilot/protocol';
import { MessageType } from '@vibepilot/protocol';
import { transportManager } from '@/lib/transport';

interface ProjectStore {
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  loading: boolean;
  showSelector: boolean;
  selectorError: string | null;

  loadProjects: () => void;
  switchProject: (projectId: string) => void;
  selectProject: (projectId: string) => Promise<void>;
  handleProjectListData: (payload: any) => void;
  handleProjectSwitched: (project: ProjectInfo) => void;
  handleProjectError: (error: string) => void;
  openSelector: () => void;
  closeSelector: () => void;
  setSelectorError: (error: string | null) => void;
  restoreLastProject: () => boolean;
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  // Listen for project:list-data from agent
  transportManager.on(MessageType.PROJECT_LIST_DATA, (msg: any) => {
    get().handleProjectListData(msg.payload);
  });

  // Listen for project:switched from agent
  transportManager.on(MessageType.PROJECT_SWITCHED, (msg: any) => {
    const { project } = msg.payload;
    get().handleProjectSwitched(project);
  });

  // Listen for project errors
  transportManager.on(MessageType.PROJECT_ERROR, (msg: any) => {
    get().handleProjectError(msg.payload.error);
  });

  return {
    projects: [],
    currentProject: null,
    loading: false,
    showSelector: false,
    selectorError: null,

    loadProjects: () => {
      set({ loading: true });
      transportManager.send(MessageType.PROJECT_LIST, {});
    },

    switchProject: (projectId: string) => {
      set({ loading: true });
      transportManager.send(MessageType.PROJECT_SWITCH, { projectId });
    },

    selectProject: async (projectId: string) => {
      set({ loading: true, selectorError: null });
      try {
        transportManager.send(MessageType.PROJECT_SWITCH, { projectId });
      } catch (error: any) {
        set({
          loading: false,
          selectorError: `Failed to switch project: ${error.message}`,
        });
      }
    },

    handleProjectListData: (payload: any) => {
      const { projects } = payload;
      set({ projects, loading: false });

      // 自动选择逻辑
      const { currentProject } = get();
      if (projects.length === 1 && !currentProject) {
        // 只有一个项目，自动选择
        get().selectProject(projects[0].id);
      } else if (!currentProject && projects.length > 0) {
        // 多个项目，显示选择器
        set({ showSelector: true });
      }
    },

    handleProjectSwitched: (project: ProjectInfo) => {
      set({
        currentProject: project,
        loading: false,
        showSelector: false,
        selectorError: null,
      });

      // 持久化到 localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('vibepilot:lastProjectId', project.id);
      }
    },

    handleProjectError: (error: string) => {
      set({
        loading: false,
        selectorError: error,
      });
    },

    restoreLastProject: () => {
      if (typeof window === 'undefined') return false;

      const lastId = localStorage.getItem('vibepilot:lastProjectId');
      if (!lastId) return false;

      const { currentProject, projects } = get();
      if (currentProject?.id === lastId) return true;

      // 检查项目是否存在
      const projectExists = projects.some((p) => p.id === lastId);
      if (projectExists) {
        get().selectProject(lastId);
        return true;
      }

      return false;
    },

    openSelector: () => set({ showSelector: true }),
    closeSelector: () => set({ showSelector: false }),
    setSelectorError: (error) => set({ selectorError: error }),
  };
});
