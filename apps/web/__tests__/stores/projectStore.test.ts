import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransportManager } = vi.hoisted(() => {
  const mockTransportManager = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    activeTransport: 'websocket' as string,
  };
  return { mockTransportManager };
});

vi.mock('@/lib/transport', () => ({
  transportManager: mockTransportManager,
  TransportManager: vi.fn(),
}));

vi.mock('@/lib/websocket', () => ({
  wsClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    state: 'disconnected',
  },
  VPWebSocketClient: vi.fn(),
}));

vi.mock('@/lib/webrtc', () => ({
  VPWebRTCClient: vi.fn(),
}));

import { useProjectStore } from '@/stores/projectStore';

describe('projectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
    });
  });

  it('has initial state with empty projects and null currentProject', () => {
    const { projects, currentProject, loading } = useProjectStore.getState();
    expect(projects).toEqual([]);
    expect(currentProject).toBeNull();
    expect(loading).toBe(false);
  });

  it('loadProjects sends project:list message', () => {
    useProjectStore.getState().loadProjects();
    expect(mockTransportManager.send).toHaveBeenCalledWith('project:list', {});
  });

  it('loadProjects sets loading to true', () => {
    useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().loading).toBe(true);
  });

  it('switchProject sends project:switch message with projectId', () => {
    useProjectStore.getState().switchProject('proj-123');
    expect(mockTransportManager.send).toHaveBeenCalledWith('project:switch', {
      projectId: 'proj-123',
    });
  });

  it('switchProject sets loading to true', () => {
    useProjectStore.getState().switchProject('proj-123');
    expect(useProjectStore.getState().loading).toBe(true);
  });

  it('handleProjectListData updates projects list and sets loading false', () => {
    const projects = [
      { id: 'p1', name: 'Project 1', path: '/home/user/p1' },
      { id: 'p2', name: 'Project 2', path: '/home/user/p2' },
    ];

    useProjectStore.setState({ loading: true });
    useProjectStore.getState().handleProjectListData({ projects });

    expect(useProjectStore.getState().projects).toEqual(projects);
    expect(useProjectStore.getState().loading).toBe(false);
  });

  it('handleProjectSwitched updates currentProject and sets loading false', () => {
    const project = { id: 'p1', name: 'Project 1', path: '/home/user/p1' };

    useProjectStore.setState({ loading: true });
    useProjectStore.getState().handleProjectSwitched(project);

    expect(useProjectStore.getState().currentProject).toEqual(project);
    expect(useProjectStore.getState().loading).toBe(false);
  });

  it('handleProjectListData sets currentProject if matching project exists', () => {
    const projects = [
      { id: 'p1', name: 'Project 1', path: '/home/user/p1' },
      { id: 'p2', name: 'Project 2', path: '/home/user/p2' },
    ];

    // Pre-set a current project
    useProjectStore.setState({
      currentProject: { id: 'p1', name: 'Project 1', path: '/home/user/p1' },
      loading: true,
    });

    useProjectStore.getState().handleProjectListData({ projects });

    // Current project should remain since it's in the list
    expect(useProjectStore.getState().currentProject).toEqual(projects[0]);
  });
});
