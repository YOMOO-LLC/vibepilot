'use client';

import { useTerminalStore } from '@/stores/terminalStore';

export function TerminalTabs() {
  const { tabs, activeTabId, createTab, closeTab, setActiveTab } =
    useTerminalStore();

  return (
    <div className="flex items-center bg-zinc-900 border-b border-zinc-800 h-9 overflow-x-auto" data-testid="terminal-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-1 px-3 h-full text-sm cursor-pointer border-r border-zinc-800 shrink-0 ${
            tab.id === activeTabId
              ? 'bg-zinc-950 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
          onClick={() => setActiveTab(tab.id)}
          data-testid={`tab-${tab.id}`}
        >
          <span>{tab.title}</span>
          <button
            className="ml-1 text-zinc-500 hover:text-zinc-200 rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            data-testid={`close-tab-${tab.id}`}
            aria-label={`Close ${tab.title}`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="px-3 h-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 text-sm"
        onClick={() => createTab()}
        data-testid="new-tab-button"
        aria-label="New terminal"
      >
        +
      </button>
    </div>
  );
}
