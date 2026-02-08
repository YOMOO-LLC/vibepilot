import { create } from 'zustand';
import type { FileNode } from '@vibepilot/protocol';
import { transportManager } from '@/lib/transport';
import { MessageType } from '@vibepilot/protocol';

interface FileTreeStore {
  childrenMap: Record<string, FileNode[]>;
  expanded: Set<string>;
  rootPath: string;

  setRoot: (path: string) => void;
  toggleExpand: (path: string) => void;
  handleFileChange: (type: string, filePath: string) => void;
}

export const useFileTreeStore = create<FileTreeStore>((set, get) => {
  // Listen for filetree:data — store entries keyed by their parent path
  transportManager.on(MessageType.FILETREE_DATA, (msg: any) => {
    const { path, entries } = msg.payload;
    set((state) => ({
      childrenMap: { ...state.childrenMap, [path]: entries },
    }));
  });

  // Listen for filetree:changed — reload affected directory
  transportManager.on(MessageType.FILETREE_CHANGED, (msg: any) => {
    const { path: changedPath } = msg.payload;
    // Find the parent directory of the changed file and reload it
    const parentDir = changedPath.substring(0, changedPath.lastIndexOf('/')) || changedPath;
    const { childrenMap } = get();
    // Reload any loaded directory that could be affected
    for (const loadedPath of Object.keys(childrenMap)) {
      if (changedPath.startsWith(loadedPath)) {
        try {
          transportManager.send(MessageType.FILETREE_LIST, { path: loadedPath });
        } catch {
          // Not connected
        }
      }
    }
  });

  return {
    childrenMap: {},
    expanded: new Set(),
    rootPath: '',

    setRoot: (path: string) => {
      set({ rootPath: path, childrenMap: {}, expanded: new Set() });
      try {
        transportManager.send(MessageType.FILETREE_LIST, { path });
      } catch {
        // Not connected
      }
    },

    toggleExpand: (path: string) => {
      const { expanded, childrenMap } = get();
      const newExpanded = new Set(expanded);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
        // Load children if not already loaded
        if (!childrenMap[path]) {
          try {
            transportManager.send(MessageType.FILETREE_LIST, { path });
          } catch {
            // Not connected
          }
        }
      }
      set({ expanded: newExpanded });
    },

    handleFileChange: (_type: string, _filePath: string) => {
      // Handled by the filetree:changed listener above
    },
  };
});
