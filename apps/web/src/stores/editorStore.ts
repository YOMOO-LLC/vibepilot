import { create } from 'zustand';
import { MessageType, type VPMessage } from '@vibepilot/protocol';
import { transportManager } from '@/lib/transport';

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  language: string;
  mimeType: string;
  encoding: 'utf-8' | 'base64';
  size: number;
  readonly: boolean;
  loading: boolean;
  error: string | null;
}

interface EditorStore {
  tabs: EditorTab[];
  activeTabId: string | null;
  counter: number;

  openFile: (filePath: string) => void;
  closeFile: (id: string) => void;
  setActiveEditorTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => void;
  isDirty: (id: string) => boolean;
  handleFileData: (msg: VPMessage) => void;
  handleFileError: (msg: VPMessage) => void;
  handleFileWritten: (msg: VPMessage) => void;
}

let editorCounter = 0;

export const useEditorStore = create<EditorStore>((set, get) => {
  // Register message listeners inside create() to ensure they fire
  transportManager.on(MessageType.FILE_DATA, (msg: VPMessage) => {
    get().handleFileData(msg);
  });

  transportManager.on(MessageType.FILE_ERROR, (msg: VPMessage) => {
    get().handleFileError(msg);
  });

  transportManager.on(MessageType.FILE_WRITTEN, (msg: VPMessage) => {
    get().handleFileWritten(msg);
  });

  return {
    tabs: [],
    activeTabId: null,
    counter: 0,

    openFile: (filePath: string) => {
      const { tabs } = get();
      // If file is already open, activate it
      const existing = tabs.find((t) => t.filePath === filePath);
      if (existing) {
        set({ activeTabId: existing.id });
        return;
      }

      editorCounter++;
      const id = `editor-${Date.now()}-${editorCounter}`;
      const fileName = filePath.split('/').pop() || filePath;

      const tab: EditorTab = {
        id,
        filePath,
        fileName,
        content: '',
        originalContent: '',
        language: '',
        mimeType: '',
        encoding: 'utf-8',
        size: 0,
        readonly: false,
        loading: true,
        error: null,
      };

      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: id,
        counter: state.counter + 1,
      }));

      // Request file content from agent
      transportManager.send(MessageType.FILE_READ, { filePath });
    },

    closeFile: (id: string) => {
      set((state) => {
        const idx = state.tabs.findIndex((t) => t.id === id);
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

        return { tabs: newTabs, activeTabId: newActive };
      });
    },

    setActiveEditorTab: (id: string) => {
      set({ activeTabId: id });
    },

    updateContent: (id: string, content: string) => {
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
      }));
    },

    saveFile: (id: string) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab || tab.readonly) return;

      transportManager.send(MessageType.FILE_WRITE, {
        filePath: tab.filePath,
        content: tab.content,
        encoding: 'utf-8',
      });
    },

    isDirty: (id: string) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return false;
      return tab.content !== tab.originalContent;
    },

    handleFileData: (msg: VPMessage) => {
      const payload = msg.payload as {
        filePath: string;
        content: string;
        encoding: 'utf-8' | 'base64';
        language: string;
        mimeType: string;
        size: number;
        readonly: boolean;
      };

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.filePath === payload.filePath && t.loading
            ? {
                ...t,
                content: payload.content,
                originalContent: payload.content,
                encoding: payload.encoding,
                language: payload.language,
                mimeType: payload.mimeType,
                size: payload.size,
                readonly: payload.readonly,
                loading: false,
                error: null,
              }
            : t
        ),
      }));
    },

    handleFileError: (msg: VPMessage) => {
      const payload = msg.payload as { filePath: string; error: string };

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.filePath === payload.filePath ? { ...t, loading: false, error: payload.error } : t
        ),
      }));
    },

    handleFileWritten: (msg: VPMessage) => {
      const payload = msg.payload as { filePath: string; size: number };

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.filePath === payload.filePath
            ? { ...t, originalContent: t.content, size: payload.size }
            : t
        ),
      }));
    },
  };
});
