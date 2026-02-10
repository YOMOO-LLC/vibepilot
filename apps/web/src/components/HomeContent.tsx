'use client';

import { useEffect } from 'react';
import { MessageType } from '@vibepilot/protocol';
import { transportManager } from '@/lib/transport';
import { TerminalSplitLayout } from '@/components/terminal/TerminalSplitLayout';
import { ConnectionStatus } from '@/components/connection/ConnectionStatus';
import { DevicePicker } from '@/components/connection/DevicePicker';
import { ProjectSwitcher } from '@/components/connection/ProjectSwitcher';
import { TokenLoginScreen } from '@/components/connection/TokenLoginScreen';
import { SupabaseLoginScreen } from '@/components/connection/SupabaseLoginScreen';
import { AgentSelectorScreen } from '@/components/connection/AgentSelectorScreen';
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
import { useAuthStore } from '@/stores/authStore';
import { useAgentStore } from '@/stores/agentStore';
import { ProjectSelectorModal } from '@/components/project/ProjectSelectorModal';

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'none';

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
    showSelector: showProjectSelector,
    selectorError,
    selectProject,
    restoreLastProject,
    loadProjects,
  } = useProjectStore();
  const { setRoot } = useFileTreeStore();
  const {
    isAuthenticated,
    loading: authLoading,
    restoreSession,
    initSupabaseListener,
  } = useAuthStore();
  const {
    agents,
    selectedAgent,
    showSelector: showAgentSelector,
    loadAgents,
    selectAgent,
    restoreLastAgent,
  } = useAgentStore();

  // Determine if auth is required
  const needsAuth = AUTH_MODE !== 'none';
  const isAuthed = !needsAuth || isAuthenticated;

  // Step 1: Restore session on mount + init Supabase listener
  useEffect(() => {
    if (needsAuth) {
      if (AUTH_MODE === 'supabase') {
        initSupabaseListener();
      }
      restoreSession();
    }
  }, [needsAuth, restoreSession, initSupabaseListener]);

  // Step 2: Once authenticated, load agents
  useEffect(() => {
    if (!isAuthed) return;

    if (needsAuth) {
      loadAgents();
      restoreLastAgent();
    }
  }, [isAuthed, needsAuth, loadAgents, restoreLastAgent]);

  // Step 3: Connect to the selected agent (or default URL)
  useEffect(() => {
    if (!isAuthed) return;

    if (needsAuth) {
      // Cloud mode: connect to the selected agent URL
      if (selectedAgent) {
        connect(selectedAgent.url);
      }
    } else {
      // Local mode: auto-connect to default URL
      connect();
    }
  }, [isAuthed, needsAuth, selectedAgent, connect]);

  // Step 4: Once connected, load projects (and re-sync project on reconnect)
  useEffect(() => {
    if (connectionState === 'connected') {
      // If we already have a project selected (e.g., agent restarted while browser open),
      // re-sync it with the agent so it updates its cwd/fileTree/fileContent services.
      const existing = useProjectStore.getState().currentProject;
      if (existing) {
        try {
          transportManager.send(MessageType.PROJECT_SWITCH, { projectId: existing.id });
        } catch {
          // Not connected yet
        }
      }

      const restored = restoreLastProject();
      if (!restored) {
        loadProjects();
      }
    }
  }, [connectionState, restoreLastProject, loadProjects]);

  // Step 5: Once project selected, initialize workspace
  useEffect(() => {
    if (currentProject && connectionState === 'connected') {
      setRoot(currentProject.path);

      if (tabs.length === 0) {
        createTab();
        const newTabs = useTerminalStore.getState().tabs;
        if (newTabs.length > 0) {
          setActivePane({ kind: 'terminal', id: newTabs[0].id });
        }
      }
    }
  }, [currentProject, connectionState, tabs.length, createTab, setActivePane, setRoot]);

  // --- Render gates ---

  // Gate 1: Login screen (only in auth mode)
  if (needsAuth && !isAuthenticated) {
    if (authLoading) {
      return (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center">
          <p className="text-zinc-400">Loading...</p>
        </div>
      );
    }
    return AUTH_MODE === 'supabase' ? <SupabaseLoginScreen /> : <TokenLoginScreen />;
  }

  // Gate 2: Agent selector (only in auth mode, when no agent selected)
  if (needsAuth && (showAgentSelector || (!selectedAgent && agents.length !== 1))) {
    return <AgentSelectorScreen />;
  }

  const isTerminalActive = activePane?.kind === 'terminal' || activePane === null;
  const isEditorActive = activePane?.kind === 'editor';

  return (
    <ImageDropZone>
      {/* Gate 3: Project selector */}
      <ProjectSelectorModal
        open={showProjectSelector && connectionState === 'connected'}
        projects={projects}
        loading={projectLoading}
        error={selectorError}
        onSelectProject={selectProject}
      />

      {/* Main app */}
      <div
        className="flex flex-col h-screen bg-zinc-950 text-zinc-100"
        style={{ display: showProjectSelector ? 'none' : 'flex' }}
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
