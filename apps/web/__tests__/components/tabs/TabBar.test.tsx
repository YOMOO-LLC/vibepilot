import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '@/components/tabs/TabBar';
import { useTerminalStore } from '@/stores/terminalStore';
import { useEditorStore } from '@/stores/editorStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Mock transport manager
vi.mock('@/lib/transport', () => {
  const handlers = new Map<string, Set<(msg: any) => void>>();
  return {
    transportManager: {
      send: vi.fn(),
      on: (type: string, handler: (msg: any) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(handler);
        return () => handlers.get(type)?.delete(handler);
      },
    },
  };
});

// Mock file icons
vi.mock('@/lib/fileIcons', () => ({
  getFileIconUrl: (name: string) => `/icons/${name}.svg`,
  getFolderIconUrl: (name: string) => `/icons/folder-${name}.svg`,
}));

describe('TabBar', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      tabs: [],
      activeTabId: null,
      layout: 'single',
      counter: 0,
      cwdMap: {},
    });
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      counter: 0,
    });
    useWorkspaceStore.setState({
      activePane: null,
    });
  });

  it('renders empty with just the + button', () => {
    render(<TabBar />);
    expect(screen.getByTestId('tab-bar')).toBeTruthy();
    expect(screen.getByTestId('new-tab-button')).toBeTruthy();
  });

  it('renders terminal tabs', () => {
    useTerminalStore.setState({
      tabs: [
        { id: 'tab-1', title: 'Terminal 1', sessionId: 'tab-1' },
        { id: 'tab-2', title: 'Terminal 2', sessionId: 'tab-2' },
      ],
      activeTabId: 'tab-1',
    });
    useWorkspaceStore.setState({
      activePane: { kind: 'terminal', id: 'tab-1' },
    });

    render(<TabBar />);
    expect(screen.getByText('Terminal 1')).toBeTruthy();
    expect(screen.getByText('Terminal 2')).toBeTruthy();
  });

  it('renders editor tabs with file names', () => {
    useEditorStore.setState({
      tabs: [
        {
          id: 'editor-1',
          filePath: '/project/src/index.ts',
          fileName: 'index.ts',
          content: '',
          originalContent: '',
          language: 'typescript',
          mimeType: 'text/plain',
          encoding: 'utf-8',
          size: 0,
          readonly: false,
          loading: false,
          error: null,
        },
      ],
      activeTabId: 'editor-1',
    });
    useWorkspaceStore.setState({
      activePane: { kind: 'editor', id: 'editor-1' },
    });

    render(<TabBar />);
    expect(screen.getByText('index.ts')).toBeTruthy();
  });

  it('shows dirty indicator for modified files', () => {
    useEditorStore.setState({
      tabs: [
        {
          id: 'editor-1',
          filePath: '/project/src/index.ts',
          fileName: 'index.ts',
          content: 'modified',
          originalContent: 'original',
          language: 'typescript',
          mimeType: 'text/plain',
          encoding: 'utf-8',
          size: 0,
          readonly: false,
          loading: false,
          error: null,
        },
      ],
      activeTabId: 'editor-1',
    });

    render(<TabBar />);
    expect(screen.getByTestId('dirty-indicator')).toBeTruthy();
  });

  it('clicking + button creates a new terminal', () => {
    render(<TabBar />);
    fireEvent.click(screen.getByTestId('new-tab-button'));

    const state = useTerminalStore.getState();
    expect(state.tabs).toHaveLength(1);
  });
});
