'use client';

import { useState, useEffect } from 'react';
import { useBrowserStore } from '@/stores/browserStore';
import { useTunnelStore } from '@/stores/tunnelStore';

export function PreviewToolbar() {
  const { currentUrl, navigate, stop } = useBrowserStore();
  const tunnels = useTunnelStore((s) => s.tunnels);
  const openTunnelForPort = useTunnelStore((s) => s.openTunnelForPort);
  const [inputUrl, setInputUrl] = useState(currentUrl);

  useEffect(() => {
    setInputUrl(currentUrl);
  }, [currentUrl]);

  // Extract port from current URL for tunnel button
  const currentPort = (() => {
    try {
      const parsed = new URL(currentUrl);
      return parsed.port ? parseInt(parsed.port, 10) : null;
    } catch {
      return null;
    }
  })();

  const tunnelId = currentPort ? `port-${currentPort}` : null;
  const tunnel = tunnelId ? tunnels[tunnelId] : undefined;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      let url = inputUrl.trim();
      if (url && !url.match(/^https?:\/\//i)) {
        url = `https://${url}`;
      }
      if (url) {
        navigate(url);
        setInputUrl(url);
      }
    }
  };

  const handleOpenTunnel = () => {
    if (currentPort && !tunnel) {
      openTunnelForPort(currentPort);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1 border-b border-zinc-700 bg-zinc-900">
      <input
        type="text"
        value={inputUrl}
        onChange={(e) => setInputUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
        placeholder="Enter URL..."
      />
      {currentPort && (
        <button
          onClick={handleOpenTunnel}
          disabled={tunnel?.state === 'opening'}
          aria-label="Open tunnel"
          data-testid="tunnel-toolbar-button"
          className={`px-2 py-1 text-xs rounded ${
            tunnel?.state === 'open'
              ? 'text-green-400 bg-green-600/20'
              : tunnel?.state === 'opening'
                ? 'text-yellow-400 bg-yellow-600/20 cursor-wait'
                : tunnel?.state === 'error'
                  ? 'text-red-400 bg-red-600/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          {tunnel?.state === 'open'
            ? 'Tunnel Open'
            : tunnel?.state === 'opening'
              ? 'Opening...'
              : tunnel?.state === 'error'
                ? 'Tunnel Error'
                : 'Open Tunnel'}
        </button>
      )}
      <button
        onClick={stop}
        aria-label="Close browser"
        className="px-2 py-1 text-sm text-zinc-400 hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
  );
}
