'use client';

import { useState, useRef, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminalStore';
import { useEditorStore } from '@/stores/editorStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useBrowserStore } from '@/stores/browserStore';
import { getFileIconUrl } from '@/lib/fileIcons';

export function TabBar() {
  const terminalTabs = useTerminalStore((s) => s.tabs);
  const terminalActiveTabId = useTerminalStore((s) => s.activeTabId);
  const setTerminalActiveTab = useTerminalStore((s) => s.setActiveTab);
  const closeTerminalTab = useTerminalStore((s) => s.closeTab);
  const createTerminalTab = useTerminalStore((s) => s.createTab);

  const editorTabs = useEditorStore((s) => s.tabs);
  const editorActiveTabId = useEditorStore((s) => s.activeTabId);
  const setEditorActiveTab = useEditorStore((s) => s.setActiveEditorTab);
  const closeEditorTab = useEditorStore((s) => s.closeFile);
  const isDirty = useEditorStore((s) => s.isDirty);

  const activePane = useWorkspaceStore((s) => s.activePane);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);

  const browserState = useBrowserStore((s) => s.state);
  const startBrowser = useBrowserStore((s) => s.start);
  const stopBrowser = useBrowserStore((s) => s.stop);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [menuOpen]);

  const handleTerminalTabClick = (id: string) => {
    setTerminalActiveTab(id);
    setActivePane({ kind: 'terminal', id });
  };

  const handleEditorTabClick = (id: string) => {
    setEditorActiveTab(id);
    setActivePane({ kind: 'editor', id });
  };

  const handleCloseTerminalTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTerminalTab(id);
    // If closed tab was active, switch to another terminal tab or null
    const remaining = terminalTabs.filter((t) => t.id !== id);
    if (activePane?.kind === 'terminal' && activePane.id === id) {
      if (remaining.length > 0) {
        setActivePane({ kind: 'terminal', id: remaining[remaining.length - 1].id });
      } else if (editorTabs.length > 0 && editorActiveTabId) {
        setActivePane({ kind: 'editor', id: editorActiveTabId });
      } else {
        setActivePane(null);
      }
    }
  };

  const handleCloseEditorTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeEditorTab(id);
    const remaining = editorTabs.filter((t) => t.id !== id);
    if (activePane?.kind === 'editor' && activePane.id === id) {
      if (remaining.length > 0) {
        setActivePane({ kind: 'editor', id: remaining[remaining.length - 1].id });
      } else if (terminalTabs.length > 0 && terminalActiveTabId) {
        setActivePane({ kind: 'terminal', id: terminalActiveTabId });
      } else {
        setActivePane(null);
      }
    }
  };

  const isActive = (kind: 'terminal' | 'editor', id: string) => {
    return activePane?.kind === kind && activePane.id === id;
  };

  return (
    <div
      className="flex items-center bg-zinc-900 border-b border-zinc-800 h-9"
      data-testid="tab-bar"
    >
      {/* Scrollable tabs area */}
      <div className="flex items-center overflow-x-auto h-full flex-1 min-w-0">
        {/* Terminal tabs */}
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-3 h-full text-sm cursor-pointer border-r border-zinc-800 shrink-0 ${
              isActive('terminal', tab.id)
                ? 'bg-zinc-950 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
            onClick={() => handleTerminalTabClick(tab.id)}
            data-testid={`tab-terminal-${tab.id}`}
          >
            <span className="text-xs">⬛</span>
            <span>{tab.title}</span>
            <button
              className="ml-1 text-zinc-500 hover:text-zinc-200 rounded-sm"
              onClick={(e) => handleCloseTerminalTab(e, tab.id)}
              aria-label={`Close ${tab.title}`}
            >
              ×
            </button>
          </div>
        ))}

        {/* Editor tabs */}
        {editorTabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-3 h-full text-sm cursor-pointer border-r border-zinc-800 shrink-0 ${
              isActive('editor', tab.id)
                ? 'bg-zinc-950 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
            onClick={() => handleEditorTabClick(tab.id)}
            data-testid={`tab-editor-${tab.id}`}
          >
            <img
              src={getFileIconUrl(tab.fileName)}
              alt=""
              width={16}
              height={16}
              className="shrink-0"
            />
            <span>{tab.fileName}</span>
            {isDirty(tab.id) && (
              <span
                className="w-2 h-2 rounded-full bg-zinc-400 shrink-0"
                data-testid="dirty-indicator"
              />
            )}
            <button
              className="ml-1 text-zinc-500 hover:text-zinc-200 rounded-sm"
              onClick={(e) => handleCloseEditorTab(e, tab.id)}
              aria-label={`Close ${tab.fileName}`}
            >
              ×
            </button>
          </div>
        ))}

        {/* Preview tab */}
        {browserState !== 'idle' && (
          <div
            className={`flex items-center gap-1 px-3 h-full text-sm cursor-pointer border-r border-zinc-800 shrink-0 ${
              activePane?.kind === 'preview'
                ? 'bg-zinc-950 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
            onClick={() => setActivePane({ kind: 'preview' })}
            data-testid="tab-preview"
          >
            <span className="text-xs">🌐</span>
            <span>Preview</span>
            <button
              className="ml-1 text-zinc-500 hover:text-zinc-200 rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                stopBrowser();
                if (activePane?.kind === 'preview') {
                  if (terminalTabs.length > 0 && terminalActiveTabId) {
                    setActivePane({ kind: 'terminal', id: terminalActiveTabId });
                  } else if (editorTabs.length > 0 && editorActiveTabId) {
                    setActivePane({ kind: 'editor', id: editorActiveTabId });
                  } else {
                    setActivePane(null);
                  }
                }
              }}
              aria-label="Close Preview"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* New tab dropdown — outside scrollable area so it won't be clipped */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          className="px-3 h-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 text-sm"
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="new-tab-button"
          aria-label="New tab"
        >
          +
        </button>
        {menuOpen && (
          <div
            className="absolute top-full right-0 mt-1 w-40 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50"
            data-testid="new-tab-menu"
          >
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              onClick={() => {
                createTerminalTab();
                const newTabs = useTerminalStore.getState().tabs;
                const newTab = newTabs[newTabs.length - 1];
                if (newTab) {
                  setActivePane({ kind: 'terminal', id: newTab.id });
                }
                setMenuOpen(false);
              }}
            >
              New Terminal
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              onClick={() => {
                setActivePane({ kind: 'preview' });
                if (browserState === 'idle') {
                  startBrowser();
                }
                setMenuOpen(false);
              }}
            >
              Open Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
