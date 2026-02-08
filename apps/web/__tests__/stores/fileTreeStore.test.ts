import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFileTreeStore } from '@/stores/fileTreeStore';
import type { FileNode } from '@vibepilot/protocol';

// Mock transport manager
vi.mock('@/lib/transport', () => {
  const handlers = new Map<string, Set<(msg: any) => void>>();

  const mockTransportManager = {
    send: vi.fn(),
    on: (type: string, handler: (msg: any) => void) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    _trigger: (type: string, payload: any) => {
      const typeHandlers = handlers.get(type);
      if (typeHandlers) {
        typeHandlers.forEach(handler => handler({ type, payload }));
      }
    },
    _clear: () => {
      handlers.clear();
    },
  };

  return {
    transportManager: mockTransportManager,
  };
});

describe('fileTreeStore', () => {
  let mockTransport: any;

  beforeEach(async () => {
    const transport = await import('@/lib/transport');
    mockTransport = transport.transportManager;

    // Reset state
    useFileTreeStore.setState({
      childrenMap: {},
      expanded: new Set(),
      rootPath: '',
    });

    vi.clearAllMocks();
  });

  it('initial state has empty childrenMap', () => {
    const state = useFileTreeStore.getState();
    expect(state.childrenMap).toEqual({});
    expect(state.expanded.size).toBe(0);
  });

  it('setRoot loads directory entries', async () => {
    const store = useFileTreeStore.getState();
    store.setRoot('/test/path');

    expect(mockTransport.send).toHaveBeenCalledWith('filetree:list', {
      path: '/test/path',
    });

    // Simulate receiving data
    const mockEntries: FileNode[] = [
      { name: 'file1.txt', path: '/test/path/file1.txt', type: 'file' },
      { name: 'dir1', path: '/test/path/dir1', type: 'directory' },
    ];

    mockTransport._trigger('filetree:data', {
      path: '/test/path',
      entries: mockEntries,
    });

    const state = useFileTreeStore.getState();
    expect(state.childrenMap['/test/path']).toEqual(mockEntries);
    expect(state.rootPath).toBe('/test/path');
  });

  it('toggleExpand expands directory and loads children', () => {
    const store = useFileTreeStore.getState();
    store.toggleExpand('/test/dir1');

    const state = useFileTreeStore.getState();
    expect(state.expanded.has('/test/dir1')).toBe(true);
    // Should request children
    expect(mockTransport.send).toHaveBeenCalledWith('filetree:list', {
      path: '/test/dir1',
    });
  });

  it('toggleExpand collapses directory when already expanded', () => {
    const store = useFileTreeStore.getState();

    store.toggleExpand('/test/dir1');
    expect(useFileTreeStore.getState().expanded.has('/test/dir1')).toBe(true);

    store.toggleExpand('/test/dir1');
    expect(useFileTreeStore.getState().expanded.has('/test/dir1')).toBe(false);
  });

  it('toggleExpand does not reload already-loaded children', () => {
    // Pre-populate childrenMap
    useFileTreeStore.setState({
      childrenMap: {
        '/test/dir1': [{ name: 'child.txt', path: '/test/dir1/child.txt', type: 'file' }],
      },
    });

    const store = useFileTreeStore.getState();
    store.toggleExpand('/test/dir1');

    // Should NOT send a request since children are already loaded
    expect(mockTransport.send).not.toHaveBeenCalled();
  });

  it('handleFileChange reloads affected directories', () => {
    useFileTreeStore.setState({
      childrenMap: {
        '/test': [{ name: 'file1.txt', path: '/test/file1.txt', type: 'file' }],
      },
      rootPath: '/test',
    });

    mockTransport._trigger('filetree:changed', {
      type: 'add',
      path: '/test/file2.txt',
    });

    expect(mockTransport.send).toHaveBeenCalledWith('filetree:list', {
      path: '/test',
    });
  });

  it('handleFileChange reloads on unlink', () => {
    useFileTreeStore.setState({
      childrenMap: {
        '/test': [
          { name: 'file1.txt', path: '/test/file1.txt', type: 'file' },
          { name: 'file2.txt', path: '/test/file2.txt', type: 'file' },
        ],
      },
      rootPath: '/test',
    });

    mockTransport._trigger('filetree:changed', {
      type: 'unlink',
      path: '/test/file2.txt',
    });

    expect(mockTransport.send).toHaveBeenCalledWith('filetree:list', {
      path: '/test',
    });
  });

  it('setRoot with different paths', () => {
    const store = useFileTreeStore.getState();

    store.setRoot('/path1');
    expect(mockTransport.send).toHaveBeenLastCalledWith('filetree:list', {
      path: '/path1',
    });

    store.setRoot('/path2');
    expect(mockTransport.send).toHaveBeenLastCalledWith('filetree:list', {
      path: '/path2',
    });
  });

  it('setRoot clears expanded state', () => {
    const store = useFileTreeStore.getState();

    store.toggleExpand('/test/dir1');
    store.toggleExpand('/test/dir2');

    expect(useFileTreeStore.getState().expanded.size).toBe(2);

    store.setRoot('/new-root');

    expect(useFileTreeStore.getState().expanded.size).toBe(0);
    expect(useFileTreeStore.getState().childrenMap).toEqual({});
  });
});
