'use client';

import { useTunnelStore } from '@/stores/tunnelStore';
import { getTunnelUrl } from '@/lib/tunnelBridge';

interface TunnelButtonProps {
  url: string;
}

function extractPort(url: string): number | null {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : null;
  } catch {
    return null;
  }
}

export function TunnelButton({ url }: TunnelButtonProps) {
  const port = extractPort(url);
  const tunnelId = port ? `port-${port}` : null;
  const tunnel = useTunnelStore((s) => (tunnelId ? s.tunnels[tunnelId] : undefined));
  const openTunnelForPort = useTunnelStore((s) => s.openTunnelForPort);

  if (!port) return null;

  const handleClick = () => {
    if (!tunnel) {
      openTunnelForPort(port);
    } else if (tunnel.state === 'open') {
      // Open the tunnel URL in a new tab
      window.open(getTunnelUrl(port), '_blank');
    }
  };

  const isOpening = tunnel?.state === 'opening';
  const isOpen = tunnel?.state === 'open';
  const isError = tunnel?.state === 'error';

  return (
    <button
      onClick={handleClick}
      disabled={isOpening}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
        isError
          ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/40'
          : isOpen
            ? 'bg-green-600/20 text-green-400 hover:bg-green-500/30 border border-green-600/40'
            : isOpening
              ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40 cursor-wait'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
      }`}
    >
      {isError ? (
        <>
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Error - Port {port}
        </>
      ) : isOpen ? (
        <>
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Connected - Port {port}
        </>
      ) : isOpening ? (
        <>
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Opening... {port}
        </>
      ) : (
        <>Open in Browser - {port}</>
      )}
    </button>
  );
}
