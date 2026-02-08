import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore, type LayoutMode } from '@/stores/terminalStore';

describe('terminalStore', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      tabs: [],
      activeTabId: null,
      layout: 'single',
      counter: 0,
    });
  });

  it('createTab adds a new tab', () => {
    const store = useTerminalStore.getState();
    store.createTab();

    const state = useTerminalStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].title).toBe('Terminal 1');
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it('createTab with custom title', () => {
    const store = useTerminalStore.getState();
    store.createTab('My Terminal');

    const state = useTerminalStore.getState();
    expect(state.tabs[0].title).toBe('My Terminal');
  });

  it('createTab auto-increments title', () => {
    const store = useTerminalStore.getState();
    store.createTab();
    store.createTab();
    store.createTab();

    const state = useTerminalStore.getState();
    expect(state.tabs.map(t => t.title)).toEqual([
      'Terminal 1',
      'Terminal 2',
      'Terminal 3',
    ]);
  });

  it('closeTab removes tab and switches active', () => {
    const store = useTerminalStore.getState();
    store.createTab();
    store.createTab();

    const state1 = useTerminalStore.getState();
    const firstTabId = state1.tabs[0].id;
    const secondTabId = state1.tabs[1].id;

    // Active should be second (most recent)
    expect(state1.activeTabId).toBe(secondTabId);

    // Close active tab
    store.closeTab(secondTabId);

    const state2 = useTerminalStore.getState();
    expect(state2.tabs).toHaveLength(1);
    expect(state2.activeTabId).toBe(firstTabId);
  });

  it('closeTab on last tab clears activeTabId', () => {
    const store = useTerminalStore.getState();
    store.createTab();

    const state1 = useTerminalStore.getState();
    store.closeTab(state1.tabs[0].id);

    const state2 = useTerminalStore.getState();
    expect(state2.tabs).toHaveLength(0);
    expect(state2.activeTabId).toBeNull();
  });

  it('setActiveTab changes active tab', () => {
    const store = useTerminalStore.getState();
    store.createTab();
    store.createTab();

    const state1 = useTerminalStore.getState();
    const firstTabId = state1.tabs[0].id;

    store.setActiveTab(firstTabId);

    expect(useTerminalStore.getState().activeTabId).toBe(firstTabId);
  });

  it('setLayout changes layout mode', () => {
    const store = useTerminalStore.getState();
    store.setLayout('horizontal');

    expect(useTerminalStore.getState().layout).toBe('horizontal');

    store.setLayout('quad');
    expect(useTerminalStore.getState().layout).toBe('quad');
  });

  it('renameTab updates title', () => {
    const store = useTerminalStore.getState();
    store.createTab();

    const state1 = useTerminalStore.getState();
    store.renameTab(state1.tabs[0].id, 'New Name');

    expect(useTerminalStore.getState().tabs[0].title).toBe('New Name');
  });

  it('nextTab cycles forward', () => {
    const store = useTerminalStore.getState();
    store.createTab(); // Tab 1
    store.createTab(); // Tab 2
    store.createTab(); // Tab 3

    const tabs = useTerminalStore.getState().tabs;
    store.setActiveTab(tabs[0].id);

    store.nextTab();
    expect(useTerminalStore.getState().activeTabId).toBe(tabs[1].id);

    store.nextTab();
    expect(useTerminalStore.getState().activeTabId).toBe(tabs[2].id);

    store.nextTab(); // Wraps around
    expect(useTerminalStore.getState().activeTabId).toBe(tabs[0].id);
  });

  it('prevTab cycles backward', () => {
    const store = useTerminalStore.getState();
    store.createTab();
    store.createTab();
    store.createTab();

    const tabs = useTerminalStore.getState().tabs;
    store.setActiveTab(tabs[0].id);

    store.prevTab(); // Wraps to last
    expect(useTerminalStore.getState().activeTabId).toBe(tabs[2].id);
  });

  // New tests for needsAttach

  it('clearNeedsAttach removes needsAttach flag', () => {
    useTerminalStore.setState({
      tabs: [
        { id: 'tab-1', title: 'Terminal 1', sessionId: 'tab-1', needsAttach: true },
        { id: 'tab-2', title: 'Terminal 2', sessionId: 'tab-2', needsAttach: true },
      ],
      activeTabId: 'tab-1',
    });

    useTerminalStore.getState().clearNeedsAttach('tab-1');
    const state = useTerminalStore.getState();
    expect(state.tabs[0].needsAttach).toBe(false);
    expect(state.tabs[1].needsAttach).toBe(true);
  });

  it('newly created tabs do not have needsAttach', () => {
    useTerminalStore.getState().createTab();
    const state = useTerminalStore.getState();
    expect(state.tabs[0].needsAttach).toBeUndefined();
  });
});
