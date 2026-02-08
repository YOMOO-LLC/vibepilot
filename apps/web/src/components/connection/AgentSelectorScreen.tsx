'use client';

import { useState, useCallback } from 'react';
import { useAgentStore, type AgentInfo } from '@/stores/agentStore';

function AgentCard({ agent, onSelect }: { agent: AgentInfo; onSelect: (id: string) => void }) {
  const { removeAgent } = useAgentStore();

  return (
    <div className="group relative">
      <button
        onClick={() => onSelect(agent.id)}
        className="w-full p-6 rounded-lg border-2 border-zinc-700 bg-zinc-900 hover:border-blue-500 hover:bg-blue-500/10 transition-all text-left"
      >
        <div className="mb-3 w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h14M12 5l7 7-7 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-zinc-100 mb-1 truncate">{agent.name}</h3>
        <p className="text-sm text-zinc-500 truncate">{agent.url}</p>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          removeAgent(agent.id);
        }}
        className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all"
        title="Remove agent"
      >
        <svg
          className="w-4 h-4 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

function AddAgentForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { addAgent } = useAgentStore();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = name.trim();
      const trimmedUrl = url.trim();

      if (!trimmedName || !trimmedUrl) {
        setError('Both name and URL are required');
        return;
      }

      // Basic URL validation
      if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
        setError('URL must start with ws:// or wss://');
        return;
      }

      setError(null);
      addAgent(trimmedName, trimmedUrl);
      setName('');
      setUrl('');
      onAdded();
    },
    [name, url, addAgent, onAdded]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-900/50"
    >
      <h3 className="text-sm font-medium text-zinc-300 mb-4">Add New Agent</h3>
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name (e.g. Home Server)"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="ws://your-server:9800"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add Agent
        </button>
      </div>
    </form>
  );
}

export function AgentSelectorScreen() {
  const { agents, selectAgent } = useAgentStore();
  const [showAddForm, setShowAddForm] = useState(agents.length === 0);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center">
      <div className="w-full max-w-3xl px-8">
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">Select an Agent</h1>
        <p className="text-zinc-400 mb-8">Choose a VibePilot agent to connect to.</p>

        {agents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onSelect={selectAgent} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 mb-6">
            <p className="text-zinc-500 mb-4">No agents configured yet.</p>
          </div>
        )}

        {showAddForm ? (
          <AddAgentForm onAdded={() => setShowAddForm(false)} />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-3 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            + Add New Agent
          </button>
        )}
      </div>
    </div>
  );
}
