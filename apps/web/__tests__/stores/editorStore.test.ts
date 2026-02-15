import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';
import { useNotificationStore } from '@/stores/notificationStore';

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
        typeHandlers.forEach((handler) => handler({ type, payload }));
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

describe('editorStore', () => {
  let mockTransport: any;

  beforeEach(async () => {
    const transport = await import('@/lib/transport');
    mockTransport = transport.transportManager;

    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      counter: 0,
    });

    useNotificationStore.setState({ notifications: [] });
    vi.clearAllMocks();
  });

  it('initial state has no tabs', () => {
    const state = useEditorStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
  });

  it('openFile creates a loading tab and sends file:read', () => {
    useEditorStore.getState().openFile('/project/src/index.ts');

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].filePath).toBe('/project/src/index.ts');
    expect(state.tabs[0].fileName).toBe('index.ts');
    expect(state.tabs[0].loading).toBe(true);
    expect(state.activeTabId).toBe(state.tabs[0].id);

    expect(mockTransport.send).toHaveBeenCalledWith('file:read', {
      filePath: '/project/src/index.ts',
    });
  });

  it('openFile activates existing tab instead of duplicating', () => {
    useEditorStore.getState().openFile('/project/src/index.ts');
    const firstTabId = useEditorStore.getState().tabs[0].id;

    // Open another file
    useEditorStore.getState().openFile('/project/src/app.ts');
    expect(useEditorStore.getState().tabs).toHaveLength(2);

    // Re-open first file
    useEditorStore.getState().openFile('/project/src/index.ts');
    expect(useEditorStore.getState().tabs).toHaveLength(2);
    expect(useEditorStore.getState().activeTabId).toBe(firstTabId);
  });

  it('closeFile removes tab and updates activeTab', () => {
    useEditorStore.getState().openFile('/project/a.ts');
    useEditorStore.getState().openFile('/project/b.ts');

    const tabs = useEditorStore.getState().tabs;
    const firstId = tabs[0].id;
    const secondId = tabs[1].id;

    // Active should be the last opened
    expect(useEditorStore.getState().activeTabId).toBe(secondId);

    // Close active tab
    useEditorStore.getState().closeFile(secondId);
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().activeTabId).toBe(firstId);
  });

  it('closeFile on last tab clears activeTabId', () => {
    useEditorStore.getState().openFile('/project/a.ts');
    const id = useEditorStore.getState().tabs[0].id;

    useEditorStore.getState().closeFile(id);
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    expect(useEditorStore.getState().activeTabId).toBeNull();
  });

  it('handleFileData fills content and metadata', () => {
    useEditorStore.getState().openFile('/project/src/index.ts');

    useEditorStore.getState().handleFileData({
      type: 'file:data',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/src/index.ts',
        content: 'const x = 1;',
        encoding: 'utf-8',
        language: 'typescript',
        mimeType: 'text/plain',
        size: 12,
        readonly: false,
      },
    });

    const tab = useEditorStore.getState().tabs[0];
    expect(tab.content).toBe('const x = 1;');
    expect(tab.originalContent).toBe('const x = 1;');
    expect(tab.language).toBe('typescript');
    expect(tab.encoding).toBe('utf-8');
    expect(tab.loading).toBe(false);
    expect(tab.error).toBeNull();
  });

  it('handleFileError sets error on tab', () => {
    useEditorStore.getState().openFile('/project/nonexistent.ts');

    useEditorStore.getState().handleFileError({
      type: 'file:error',
      id: 'msg-2',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/nonexistent.ts',
        error: 'ENOENT: no such file or directory',
      },
    });

    const tab = useEditorStore.getState().tabs[0];
    expect(tab.loading).toBe(false);
    expect(tab.error).toBe('ENOENT: no such file or directory');
  });

  it('updateContent changes tab content', () => {
    useEditorStore.getState().openFile('/project/a.ts');
    const id = useEditorStore.getState().tabs[0].id;

    // Simulate file data received
    useEditorStore.getState().handleFileData({
      type: 'file:data',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/a.ts',
        content: 'original',
        encoding: 'utf-8',
        language: 'typescript',
        mimeType: 'text/plain',
        size: 8,
        readonly: false,
      },
    });

    useEditorStore.getState().updateContent(id, 'modified');
    expect(useEditorStore.getState().tabs[0].content).toBe('modified');
  });

  it('isDirty detects modifications', () => {
    useEditorStore.getState().openFile('/project/a.ts');
    const id = useEditorStore.getState().tabs[0].id;

    useEditorStore.getState().handleFileData({
      type: 'file:data',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/a.ts',
        content: 'original',
        encoding: 'utf-8',
        language: 'typescript',
        mimeType: 'text/plain',
        size: 8,
        readonly: false,
      },
    });

    expect(useEditorStore.getState().isDirty(id)).toBe(false);

    useEditorStore.getState().updateContent(id, 'modified');
    expect(useEditorStore.getState().isDirty(id)).toBe(true);

    useEditorStore.getState().updateContent(id, 'original');
    expect(useEditorStore.getState().isDirty(id)).toBe(false);
  });

  it('saveFile sends file:write message', () => {
    useEditorStore.getState().openFile('/project/a.ts');
    const id = useEditorStore.getState().tabs[0].id;

    useEditorStore.getState().handleFileData({
      type: 'file:data',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/a.ts',
        content: 'original',
        encoding: 'utf-8',
        language: 'typescript',
        mimeType: 'text/plain',
        size: 8,
        readonly: false,
      },
    });

    useEditorStore.getState().updateContent(id, 'modified');
    vi.clearAllMocks();

    useEditorStore.getState().saveFile(id);

    expect(mockTransport.send).toHaveBeenCalledWith('file:write', {
      filePath: '/project/a.ts',
      content: 'modified',
      encoding: 'utf-8',
    });
  });

  it('saveFile does nothing for readonly tabs', () => {
    useEditorStore.getState().openFile('/project/img.png');
    const id = useEditorStore.getState().tabs[0].id;

    useEditorStore.getState().handleFileData({
      type: 'file:data',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/img.png',
        content: 'base64data',
        encoding: 'base64',
        language: '',
        mimeType: 'image/png',
        size: 100,
        readonly: true,
      },
    });

    vi.clearAllMocks();
    useEditorStore.getState().saveFile(id);
    expect(mockTransport.send).not.toHaveBeenCalled();
  });

  it('handleFileError adds error notification', () => {
    useEditorStore.getState().openFile('/project/missing-file.ts');

    useEditorStore.getState().handleFileError({
      type: 'file:error',
      id: 'msg-err',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/missing-file.ts',
        error: 'ENOENT: no such file or directory',
      },
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('error');
    expect(notifications[0].message).toContain('missing-file.ts');
    expect(notifications[0].detail).toBe('ENOENT: no such file or directory');
  });

  it('handleFileError notification uses filename only, not full path', () => {
    useEditorStore.getState().openFile('/very/deep/nested/path/to/component.tsx');

    useEditorStore.getState().handleFileError({
      type: 'file:error',
      id: 'msg-err2',
      timestamp: Date.now(),
      payload: {
        filePath: '/very/deep/nested/path/to/component.tsx',
        error: 'Permission denied',
      },
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications[0].message).toContain('component.tsx');
    expect(notifications[0].message).not.toContain('/very/deep');
  });

  it('handleFileWritten resets dirty state', () => {
    useEditorStore.getState().openFile('/project/a.ts');
    const id = useEditorStore.getState().tabs[0].id;

    useEditorStore.getState().handleFileData({
      type: 'file:data',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/a.ts',
        content: 'original',
        encoding: 'utf-8',
        language: 'typescript',
        mimeType: 'text/plain',
        size: 8,
        readonly: false,
      },
    });

    useEditorStore.getState().updateContent(id, 'modified');
    expect(useEditorStore.getState().isDirty(id)).toBe(true);

    useEditorStore.getState().handleFileWritten({
      type: 'file:written',
      id: 'msg-2',
      timestamp: Date.now(),
      payload: {
        filePath: '/project/a.ts',
        size: 8,
      },
    });

    expect(useEditorStore.getState().isDirty(id)).toBe(false);
    expect(useEditorStore.getState().tabs[0].originalContent).toBe('modified');
  });
});
