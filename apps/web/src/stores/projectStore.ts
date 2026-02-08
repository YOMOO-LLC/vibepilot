import { create } from 'zustand';
import type { ProjectInfo } from '@vibepilot/protocol';
import { MessageType } from '@vibepilot/protocol';
import { transportManager } from '@/lib/transport';

interface ProjectStore {
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  loading: boolean;

  loadProjects: () => void;
  switchProject: (projectId: string) => void;
  handleProjectListData: (projects: ProjectInfo[]) => void;
  handleProjectSwitched: (project: ProjectInfo) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  // Listen for project:list-data from agent
  transportManager.on(MessageType.PROJECT_LIST_DATA, (msg: any) => {
    const { projects } = msg.payload;
    get().handleProjectListData(projects);
  });

  // Listen for project:switched from agent
  transportManager.on(MessageType.PROJECT_SWITCHED, (msg: any) => {
    const { project } = msg.payload;
    get().handleProjectSwitched(project);
  });

  return {
    projects: [],
    currentProject: null,
    loading: false,

    loadProjects: () => {
      set({ loading: true });
      transportManager.send(MessageType.PROJECT_LIST, {});
    },

    switchProject: (projectId: string) => {
      set({ loading: true });
      transportManager.send(MessageType.PROJECT_SWITCH, { projectId });
    },

    handleProjectListData: (projects: ProjectInfo[]) => {
      const currentProject = get().currentProject;
      // If we have a current project, keep it if it's still in the list
      const updatedCurrent = currentProject
        ? projects.find((p) => p.id === currentProject.id) ?? null
        : null;
      set({
        projects,
        currentProject: updatedCurrent,
        loading: false,
      });
    },

    handleProjectSwitched: (project: ProjectInfo) => {
      set({
        currentProject: project,
        loading: false,
      });
    },
  };
});
