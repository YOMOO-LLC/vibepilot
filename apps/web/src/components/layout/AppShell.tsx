'use client';

import { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [sidebarVisible] = useState(true);

  return (
    <PanelGroup direction="horizontal" className="h-full">
      {sidebarVisible && (
        <>
          <Panel defaultSize={20} minSize={15} maxSize={40} className="bg-zinc-900">
            {sidebar}
          </Panel>
          <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-600 transition-colors" />
        </>
      )}
      <Panel minSize={40}>{children}</Panel>
    </PanelGroup>
  );
}
