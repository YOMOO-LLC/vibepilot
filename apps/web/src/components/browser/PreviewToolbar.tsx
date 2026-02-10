'use client';

import { useState, useEffect } from 'react';
import { useBrowserStore } from '@/stores/browserStore';

export function PreviewToolbar() {
  const { currentUrl, navigate, stop } = useBrowserStore();
  const [inputUrl, setInputUrl] = useState(currentUrl);

  useEffect(() => {
    setInputUrl(currentUrl);
  }, [currentUrl]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigate(inputUrl);
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
