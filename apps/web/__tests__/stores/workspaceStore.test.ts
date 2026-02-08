import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activePane: null });
  });

  it('starts with null activePane', () => {
    expect(useWorkspaceStore.getState().activePane).toBeNull();
  });

  it('setActivePane sets terminal pane', () => {
    useWorkspaceStore.getState().setActivePane({ kind: 'terminal', id: 'tab-1' });
    expect(useWorkspaceStore.getState().activePane).toEqual({ kind: 'terminal', id: 'tab-1' });
  });

  it('setActivePane sets editor pane', () => {
    useWorkspaceStore.getState().setActivePane({ kind: 'editor', id: 'editor-1' });
    expect(useWorkspaceStore.getState().activePane).toEqual({ kind: 'editor', id: 'editor-1' });
  });

  it('setActivePane can reset to null', () => {
    useWorkspaceStore.getState().setActivePane({ kind: 'terminal', id: 'tab-1' });
    useWorkspaceStore.getState().setActivePane(null);
    expect(useWorkspaceStore.getState().activePane).toBeNull();
  });

  it('setActivePane switches between terminal and editor', () => {
    const store = useWorkspaceStore.getState();
    store.setActivePane({ kind: 'terminal', id: 'tab-1' });
    expect(useWorkspaceStore.getState().activePane?.kind).toBe('terminal');

    store.setActivePane({ kind: 'editor', id: 'editor-1' });
    expect(useWorkspaceStore.getState().activePane?.kind).toBe('editor');
  });
});
