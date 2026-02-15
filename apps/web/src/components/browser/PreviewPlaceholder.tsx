'use client';

import { useBrowserStore } from '@/stores/browserStore';
import { TunnelButton } from './TunnelButton';

export function PreviewPlaceholder() {
  const { state, error, start, detectedPorts } = useBrowserStore();

  if (state === 'starting') {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        <p>Starting browser...</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => start()}
          className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
      <p>Open Browser Preview</p>
      <button
        onClick={() => start()}
        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white"
      >
        Open Browser
      </button>
      {detectedPorts.length > 0 && (
        <div className="flex flex-col gap-2 mt-4" data-testid="detected-ports">
          <p className="text-xs text-zinc-500">Detected dev servers:</p>
          <div className="flex flex-wrap gap-2">
            {detectedPorts.map((url) => (
              <TunnelButton key={url} url={url} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
