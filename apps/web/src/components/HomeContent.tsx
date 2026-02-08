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

export default function HomeContent() {
  useKeyboardShortcuts();

  const { tabs, createTab } = useTerminalStore();
  const { connect, state: connectionState } = useConnectionStore();
  const activePane = useWorkspaceStore((s) => s.activePane);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, []);

  // Create initial tab after connection is established
  useEffect(() => {
    if (connectionState === 'connected' && tabs.length === 0) {
      createTab();
      // Set initial active pane to the new terminal tab
      const newTabs = useTerminalStore.getState().tabs;
      if (newTabs.length > 0) {
        setActivePane({ kind: 'terminal', id: newTabs[0].id });
      }
    }
  }, [connectionState]);

  const isTerminalActive = activePane?.kind === 'terminal' || activePane === null;
  const isEditorActive = activePane?.kind === 'editor';

  return (
    <ImageDropZone>
      <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
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
