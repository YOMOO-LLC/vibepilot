'use client';

import { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

export function DevicePicker() {
  const { state, url, connect, disconnect } = useConnectionStore();
  const [inputUrl, setInputUrl] = useState(url);

  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting';

  const handleConnect = () => {
    connect(inputUrl);
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div className="flex items-center gap-2" data-testid="device-picker">
      <input
        data-testid="device-picker-url"
        type="text"
        value={inputUrl}
        onChange={(e) => setInputUrl(e.target.value)}
        disabled={isConnected || isConnecting}
        className="px-2 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed w-56"
        placeholder="ws://host:port"
      />
      {isConnected ? (
        <button
          onClick={handleDisconnect}
          className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
        >
          Disconnect
        </button>
      ) : isConnecting ? (
        <button
          disabled
          className="px-3 py-1 text-sm bg-yellow-600 text-white rounded opacity-75 cursor-not-allowed"
        >
          Connecting...
        </button>
      ) : (
        <button
          onClick={handleConnect}
          className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
        >
          Connect
        </button>
      )}
    </div>
  );
}
