'use client';

import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

export function ConnectionStatus() {
  const { state, connect, disconnect } = useConnectionStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const statusColor = {
    disconnected: 'bg-red-500',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
  }[state];

  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
  }[state];

  return (
    <div className="flex items-center gap-2 text-sm" data-testid="connection-status">
      <span className={`w-2 h-2 rounded-full ${statusColor}`} />
      <span className="text-zinc-400">{statusText}</span>
    </div>
  );
}
