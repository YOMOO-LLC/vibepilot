'use client';

import { useEffect } from 'react';
import { TerminalSplitLayout } from '@/components/terminal/TerminalSplitLayout';
import { ConnectionStatus } from '@/components/connection/ConnectionStatus';
import { DevicePicker } from '@/components/connection/DevicePicker';
import { ProjectSwitcher } from '@/components/connection/ProjectSwitcher';
import { AppShell } from '@/components/layout/AppShell';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { FileTreePanel } from '@/components/filetree/FileTreePanel';
import { TabBar } from '@/components/tabs/TabBar';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { ImageDropZone } from '@/components/image/ImageDropZone';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTerminalStore } from '@/stores/terminalStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useProjectStore } from '@/stores/projectStore';
import { useFileTreeStore } from '@/stores/fileTreeStore';
import { ProjectSelectorModal } from '@/components/project/ProjectSelectorModal';

export default function HomeContent() {
  useKeyboardShortcuts();

  const { tabs, createTab } = useTerminalStore();
  const { connect, state: connectionState } = useConnectionStore();
  const activePane = useWorkspaceStore((s) => s.activePane);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const {
    projects,
    currentProject,
    loading: projectLoading,
    showSelector,
    selectorError,
    selectProject,
    restoreLastProject,
    loadProjects,
  } = useProjectStore();
  const { setRoot } = useFileTreeStore();

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, []);

  // 连接后加载项目或恢复上次选择
  useEffect(() => {
    if (connectionState === 'connected') {
      const restored = restoreLastProject();
      if (!restored) {
        loadProjects();
      }
    }
  }, [connectionState, restoreLastProject, loadProjects]);

  // 项目选择后初始化工作区
  useEffect(() => {
    if (currentProject && connectionState === 'connected') {
      setRoot(currentProject.path);

      // 创建首个终端
      if (tabs.length === 0) {
        createTab();
        const newTabs = useTerminalStore.getState().tabs;
        if (newTabs.length > 0) {
          setActivePane({ kind: 'terminal', id: newTabs[0].id });
        }
      }
    }
  }, [currentProject, connectionState, tabs.length, createTab, setActivePane, setRoot]);

  const isTerminalActive = activePane?.kind === 'terminal' || activePane === null;
  const isEditorActive = activePane?.kind === 'editor';

  return (
    <ImageDropZone>
      {/* 项目选择器 - 阻塞模态框 */}
      <ProjectSelectorModal
        open={showSelector && connectionState === 'connected'}
        projects={projects}
        loading={projectLoading}
        error={selectorError}
        onSelectProject={selectProject}
      />

      {/* 主应用 - 选择器打开时隐藏 */}
      <div
        className="flex flex-col h-screen bg-zinc-950 text-zinc-100"
        style={{ display: showSelector ? 'none' : 'flex' }}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
          <h1 className="text-lg font-semibold">VibePilot</h1>
          <div className="flex items-center gap-4">
            <DevicePicker />
            <ProjectSwitcher />
            <ConnectionStatus />
          </div>
        </header>

        {/* Main content */}
        <AppShell
          sidebar={
            <Sidebar>
              <FileTreePanel />
            </Sidebar>
          }
        >
          <div className="flex flex-col h-full">
            <TabBar />
            <main className="flex-1 overflow-hidden relative">
              {/* Terminal: use display:none to preserve xterm state */}
              <div style={{ display: isTerminalActive ? 'block' : 'none', height: '100%' }}>
                <TerminalSplitLayout />
              </div>
              {isEditorActive && <EditorPanel />}
            </main>
          </div>
        </AppShell>

        {/* StatusBar */}
        <StatusBar />
      </div>
    </ImageDropZone>
  );
}
