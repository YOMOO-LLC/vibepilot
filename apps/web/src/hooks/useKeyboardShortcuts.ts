'use client';

import { useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminalStore';
import { useEditorStore } from '@/stores/editorStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function useKeyboardShortcuts() {
  const { createTab, closeTab: closeTerminalTab, nextTab, prevTab, activeTabId: terminalActiveTabId } =
    useTerminalStore();
  const { closeFile, saveFile, activeTabId: editorActiveTabId } =
    useEditorStore();
  const activePane = useWorkspaceStore((s) => s.activePane);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S → Save current editor file
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        if (activePane?.kind === 'editor' && editorActiveTabId) {
          saveFile(editorActiveTabId);
        }
        return;
      }

      // Ctrl+W / Cmd+W → Close current tab (editor or terminal)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'w') {
        e.preventDefault();
        if (activePane?.kind === 'editor' && editorActiveTabId) {
          closeFile(editorActiveTabId);
        } else if (activePane?.kind === 'terminal' && terminalActiveTabId) {
          closeTerminalTab(terminalActiveTabId);
        }
        return;
      }

      // Ctrl+Shift+T → New terminal tab
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        createTab();
        return;
      }

      // Ctrl+Shift+W → Close terminal tab (legacy)
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        if (terminalActiveTabId) {
          closeTerminalTab(terminalActiveTabId);
        }
        return;
      }

      // Ctrl+Tab → Next tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        nextTab();
        return;
      }

      // Ctrl+Shift+Tab → Previous tab
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        prevTab();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createTab, closeTerminalTab, closeFile, saveFile, nextTab, prevTab, terminalActiveTabId, editorActiveTabId, activePane]);
}
