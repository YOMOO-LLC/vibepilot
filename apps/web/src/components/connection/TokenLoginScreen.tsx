'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function TokenLoginScreen() {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { setToken: saveToken } = useAuthStore();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = token.trim();
      if (!trimmed) {
        setError('Please enter a token');
        return;
      }
      setError(null);
      saveToken(trimmed);
    },
    [token, saveToken]
  );

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-md px-8">
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">VibePilot</h1>
        <p className="text-zinc-400 mb-8">Enter your authentication token to connect.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-zinc-300 mb-1">
              Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="vp_..."
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Connect
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500 text-center">
          Token is set via <code className="text-zinc-400">--token</code> when starting the agent.
        </p>
      </div>
    </div>
  );
}
