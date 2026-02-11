import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTerminalStore } from '@/stores/terminalStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      tabs: [
        { id: 'tab-1', title: 'Terminal 1', sessionId: 'tab-1' },
        { id: 'tab-2', title: 'Terminal 2', sessionId: 'tab-2' },
      ],
      activeTabId: 'tab-1',
      layout: 'single',
      counter: 2,
    });
  });

  function fireKeydown(key: string, opts: Partial<KeyboardEvent> = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    window.dispatchEvent(event);
  }

  it('Ctrl+Shift+T creates new tab', () => {
    renderHook(() => useKeyboardShortcuts());
    const tabsBefore = useTerminalStore.getState().tabs.length;

    fireKeydown('T', { ctrlKey: true, shiftKey: true });

    expect(useTerminalStore.getState().tabs.length).toBe(tabsBefore + 1);
  });

  it('Ctrl+Shift+W closes active tab', () => {
    renderHook(() => useKeyboardShortcuts());
    const tabsBefore = useTerminalStore.getState().tabs.length;

    fireKeydown('W', { ctrlKey: true, shiftKey: true });

    expect(useTerminalStore.getState().tabs.length).toBe(tabsBefore - 1);
  });

  it('Ctrl+Tab switches to next tab', () => {
    renderHook(() => useKeyboardShortcuts());

    expect(useTerminalStore.getState().activeTabId).toBe('tab-1');

    fireKeydown('Tab', { ctrlKey: true });

    expect(useTerminalStore.getState().activeTabId).toBe('tab-2');
  });

  it('Ctrl+Shift+Tab switches to previous tab', () => {
    renderHook(() => useKeyboardShortcuts());
    useTerminalStore.getState().setActiveTab('tab-2');

    fireKeydown('Tab', { ctrlKey: true, shiftKey: true });

    expect(useTerminalStore.getState().activeTabId).toBe('tab-1');
  });

  it('Ctrl+Shift+T does NOT create tab when preview active', () => {
    useWorkspaceStore.setState({ activePane: { kind: 'preview' } });
    renderHook(() => useKeyboardShortcuts());
    const tabsBefore = useTerminalStore.getState().tabs.length;

    fireKeydown('T', { ctrlKey: true, shiftKey: true });

    expect(useTerminalStore.getState().tabs.length).toBe(tabsBefore);
  });

  it('Ctrl+Shift+T still works when terminal active', () => {
    useWorkspaceStore.setState({ activePane: { kind: 'terminal', id: 'tab-1' } });
    renderHook(() => useKeyboardShortcuts());
    const tabsBefore = useTerminalStore.getState().tabs.length;

    fireKeydown('T', { ctrlKey: true, shiftKey: true });

    expect(useTerminalStore.getState().tabs.length).toBe(tabsBefore + 1);
  });
});
