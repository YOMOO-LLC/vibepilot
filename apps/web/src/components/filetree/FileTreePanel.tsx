import { useEffect, useCallback } from 'react';
import { useFileTreeStore } from '@/stores/fileTreeStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useEditorStore } from '@/stores/editorStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { FileTreeNode } from './FileTreeNode';

export function FileTreePanel() {
  const { childrenMap, rootPath, expanded, setRoot, toggleExpand } = useFileTreeStore();
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const tabs = useTerminalStore((s) => s.tabs);
  const cwdMap = useTerminalStore((s) => s.cwdMap);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeCwd = activeTab ? cwdMap[activeTab.sessionId] : undefined;

  // When active terminal's cwd changes, set it as the file tree root
  useEffect(() => {
    if (activeCwd && activeCwd !== rootPath) {
      setRoot(activeCwd);
    }
  }, [activeCwd, rootPath, setRoot]);

  const openFile = useEditorStore((s) => s.openFile);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);

  const handleFileClick = useCallback((filePath: string) => {
    openFile(filePath);
    // After opening, the new tab will be the active one in editorStore
    const editorState = useEditorStore.getState();
    if (editorState.activeTabId) {
      setActivePane({ kind: 'editor', id: editorState.activeTabId });
    }
  }, [openFile, setActivePane]);

  const rootEntries = childrenMap[rootPath] || [];

  return (
    <div style={{ padding: '8px', overflowY: 'auto', height: '100%' }}>
      {rootPath && (
        <div className="text-xs text-zinc-500 mb-2 truncate" title={rootPath}>
          {rootPath}
        </div>
      )}
      {rootEntries.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          expanded={expanded}
          childrenMap={childrenMap}
          onToggle={toggleExpand}
          onFileClick={handleFileClick}
          level={0}
        />
      ))}
    </div>
  );
}
