import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/transport', () => ({
  transportManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    activeTransport: 'websocket',
  },
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

import { ProjectSwitcher } from '@/components/connection/ProjectSwitcher';
import { useProjectStore } from '@/stores/projectStore';

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
    });
  });

  it('shows "No project" when no project is selected', () => {
    render(<ProjectSwitcher />);
    expect(screen.getByText('No project')).toBeDefined();
  });

  it('shows current project name when project is selected', () => {
    useProjectStore.setState({
      currentProject: { id: 'p1', name: 'My Project', path: '/home/user/p1' },
    });

    render(<ProjectSwitcher />);
    expect(screen.getByText('My Project')).toBeDefined();
  });

  it('renders project list when dropdown is opened', () => {
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'Project Alpha', path: '/home/user/alpha' },
        { id: 'p2', name: 'Project Beta', path: '/home/user/beta' },
      ],
    });

    render(<ProjectSwitcher />);

    // Click to open dropdown
    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    expect(screen.getByText('Project Alpha')).toBeDefined();
    expect(screen.getByText('Project Beta')).toBeDefined();
  });

  it('highlights current project in dropdown', () => {
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'Project Alpha', path: '/home/user/alpha' },
        { id: 'p2', name: 'Project Beta', path: '/home/user/beta' },
      ],
      currentProject: { id: 'p1', name: 'Project Alpha', path: '/home/user/alpha' },
    });

    render(<ProjectSwitcher />);

    // Open dropdown
    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    const activeItem = screen.getByTestId('project-item-p1');
    expect(activeItem.getAttribute('data-active')).toBe('true');
  });

  it('calls switchProject when a project is clicked', () => {
    const switchProject = vi.fn();
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'Project Alpha', path: '/home/user/alpha' },
        { id: 'p2', name: 'Project Beta', path: '/home/user/beta' },
      ],
      switchProject,
    });

    render(<ProjectSwitcher />);

    // Open dropdown
    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    // Click Project Beta
    const betaItem = screen.getByTestId('project-item-p2');
    fireEvent.click(betaItem);

    expect(switchProject).toHaveBeenCalledWith('p2');
  });

  it('shows loading state', () => {
    useProjectStore.setState({ loading: true });

    render(<ProjectSwitcher />);
    expect(screen.getByTestId('project-switcher-loading')).toBeDefined();
  });
});
