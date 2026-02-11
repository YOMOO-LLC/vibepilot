import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTreePanel } from '@/components/filetree/FileTreePanel';
import { useFileTreeStore } from '@/stores/fileTreeStore';
import { useTerminalStore } from '@/stores/terminalStore';
import type { FileNode } from '@vibepilot/protocol';

// Mock the stores
vi.mock('@/stores/fileTreeStore', () => ({
  useFileTreeStore: vi.fn(),
}));

vi.mock('@/stores/terminalStore', () => ({
  useTerminalStore: vi.fn(),
}));

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: Object.assign(
    vi.fn(() => vi.fn()),
    {
      getState: vi.fn(() => ({ activeTabId: null })),
    }
  ),
}));

vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn(() => vi.fn()),
}));

// Mock file icons
vi.mock('@/lib/fileIcons', () => ({
  getFileIconUrl: (name: string) => `/icons/${name}.svg`,
  getFolderIconUrl: (name: string, isOpen: boolean) =>
    `/icons/folder-${isOpen ? 'open' : 'closed'}-${name}.svg`,
}));

describe('FileTreePanel', () => {
  const mockToggleExpand = vi.fn();
  const mockSetRoot = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default terminal store mock - no active tab
    (useTerminalStore as any).mockImplementation((selector?: any) => {
      const state = {
        activeTabId: null,
        tabs: [],
        cwdMap: {},
      };
      return selector ? selector(state) : state;
    });
  });

  function setupFileTreeStore(overrides: any = {}) {
    const defaults = {
      childrenMap: {},
      rootPath: '',
      expanded: new Set(),
      setRoot: mockSetRoot,
      toggleExpand: mockToggleExpand,
      ...overrides,
    };
    (useFileTreeStore as any).mockReturnValue(defaults);
  }

  it('renders file tree entries', () => {
    const mockEntries: FileNode[] = [
      { name: 'file1.txt', path: '/test/file1.txt', type: 'file' },
      { name: 'dir1', path: '/test/dir1', type: 'directory' },
    ];

    setupFileTreeStore({
      childrenMap: { '/test': mockEntries },
      rootPath: '/test',
    });

    render(<FileTreePanel />);

    expect(screen.getByText('file1.txt')).toBeDefined();
    expect(screen.getByText('dir1')).toBeDefined();
  });

  it('clicking directory toggles expand', () => {
    const mockEntries: FileNode[] = [{ name: 'dir1', path: '/test/dir1', type: 'directory' }];

    setupFileTreeStore({
      childrenMap: { '/test': mockEntries },
      rootPath: '/test',
    });

    render(<FileTreePanel />);

    const dirElement = screen.getByText('dir1');
    fireEvent.click(dirElement);

    expect(mockToggleExpand).toHaveBeenCalledWith('/test/dir1');
  });

  it('shows file icon for files', () => {
    const mockEntries: FileNode[] = [{ name: 'test.txt', path: '/test/test.txt', type: 'file' }];

    setupFileTreeStore({
      childrenMap: { '/test': mockEntries },
      rootPath: '/test',
    });

    const { container } = render(<FileTreePanel />);
    const img = container.querySelector('img[src*="test.txt"]');
    expect(img).toBeTruthy();
  });

  it('shows directory icon for directories', () => {
    const mockEntries: FileNode[] = [{ name: 'testdir', path: '/test/testdir', type: 'directory' }];

    setupFileTreeStore({
      childrenMap: { '/test': mockEntries },
      rootPath: '/test',
    });

    const { container } = render(<FileTreePanel />);
    const img = container.querySelector('img[src*="folder"]');
    expect(img).toBeTruthy();
  });

  it('renders empty state when no entries', () => {
    setupFileTreeStore();

    const { container } = render(<FileTreePanel />);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders nested children when directory is expanded', () => {
    const rootEntries: FileNode[] = [{ name: 'dir1', path: '/test/dir1', type: 'directory' }];
    const childEntries: FileNode[] = [
      { name: 'nested.txt', path: '/test/dir1/nested.txt', type: 'file' },
    ];

    setupFileTreeStore({
      childrenMap: {
        '/test': rootEntries,
        '/test/dir1': childEntries,
      },
      rootPath: '/test',
      expanded: new Set(['/test/dir1']),
    });

    render(<FileTreePanel />);

    expect(screen.getByText('dir1')).toBeDefined();
    expect(screen.getByText('nested.txt')).toBeDefined();
  });

  it('hides children when directory is not expanded', () => {
    const rootEntries: FileNode[] = [{ name: 'dir1', path: '/test/dir1', type: 'directory' }];
    const childEntries: FileNode[] = [
      { name: 'nested.txt', path: '/test/dir1/nested.txt', type: 'file' },
    ];

    setupFileTreeStore({
      childrenMap: {
        '/test': rootEntries,
        '/test/dir1': childEntries,
      },
      rootPath: '/test',
      expanded: new Set(), // Not expanded
    });

    render(<FileTreePanel />);

    expect(screen.getByText('dir1')).toBeDefined();
    expect(screen.queryByText('nested.txt')).toBeNull();
  });
});
