'use client';

import { useCallback } from 'react';
import { useTerminal } from '@/hooks/useTerminal';

interface TerminalInstanceProps {
  sessionId: string;
}

export function TerminalInstance({ sessionId }: TerminalInstanceProps) {
  const { attach } = useTerminal({ sessionId });

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        attach(node);
      }
    },
    [attach]
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-zinc-950"
      data-testid="terminal-container"
    />
  );
}
