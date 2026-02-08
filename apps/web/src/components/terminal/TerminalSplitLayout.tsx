'use client';

import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useTerminalStore } from '@/stores/terminalStore';
import { TerminalInstance } from './TerminalInstance';

function ResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={`${
        direction === 'horizontal' ? 'w-1' : 'h-1'
      } bg-zinc-800 hover:bg-zinc-600 transition-colors`}
    />
  );
}

export function TerminalSplitLayout() {
  const { tabs, activeTabId, layout } = useTerminalStore();

  if (tabs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500" data-testid="empty-state">
        No terminals open. Press Ctrl+Shift+T or click + to create one.
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (layout === 'single' || tabs.length === 1) {
    return activeTab ? (
      <div className="h-full" data-testid="layout-single">
        <TerminalInstance sessionId={activeTab.sessionId} />
      </div>
    ) : null;
  }

  const visibleTabs = tabs.slice(0, layout === 'quad' ? 4 : 2);

  if (layout === 'horizontal') {
    return (
      <PanelGroup direction="horizontal" data-testid="layout-horizontal">
        {visibleTabs.map((tab, i) => (
          <Panel key={tab.id} minSize={20}>
            {i > 0 && <ResizeHandle direction="horizontal" />}
            <TerminalInstance sessionId={tab.sessionId} />
          </Panel>
        ))}
      </PanelGroup>
    );
  }

  if (layout === 'vertical') {
    return (
      <PanelGroup direction="vertical" data-testid="layout-vertical">
        {visibleTabs.map((tab, i) => (
          <Panel key={tab.id} minSize={20}>
            {i > 0 && <ResizeHandle direction="vertical" />}
            <TerminalInstance sessionId={tab.sessionId} />
          </Panel>
        ))}
      </PanelGroup>
    );
  }

  // Quad layout
  const quadTabs = tabs.slice(0, 4);
  return (
    <PanelGroup direction="vertical" data-testid="layout-quad">
      <Panel minSize={20}>
        <PanelGroup direction="horizontal">
          {quadTabs.slice(0, 2).map((tab, i) => (
            <Panel key={tab.id} minSize={20}>
              {i > 0 && <ResizeHandle direction="horizontal" />}
              <TerminalInstance sessionId={tab.sessionId} />
            </Panel>
          ))}
        </PanelGroup>
      </Panel>
      <ResizeHandle direction="vertical" />
      <Panel minSize={20}>
        <PanelGroup direction="horizontal">
          {quadTabs.slice(2, 4).map((tab, i) => (
            <Panel key={tab.id} minSize={20}>
              {i > 0 && <ResizeHandle direction="horizontal" />}
              <TerminalInstance sessionId={tab.sessionId} />
            </Panel>
          ))}
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
