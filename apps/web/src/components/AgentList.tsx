'use client';

import { useEffect } from 'react';
import { agentStore } from '@/stores/agentStore';

export function AgentList() {
  const { agents, initialize, selectAgent } = agentStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (agents.length === 0) {
    return (
      <div className="p-4">
        <p className="text-gray-500">没有找到 Agent</p>
        <p className="text-sm text-gray-400 mt-2">
          在本地运行 <code className="bg-gray-100 px-2 py-1 rounded">vibepilot start</code> 来注册
          Agent
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-semibold mb-4">我的项目</h2>

      {agents.map((agent) => (
        <div
          key={agent.id}
          className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition"
          onClick={() => selectAgent(agent.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-medium">{agent.name}</h3>
              <p className="text-sm text-gray-500">{agent.projectPath}</p>
            </div>

            <div className="flex items-center gap-2">
              {agent.online ? (
                <span className="flex items-center text-green-600 text-sm">
                  <span className="w-2 h-2 bg-green-600 rounded-full mr-1"></span>
                  在线
                </span>
              ) : (
                <span className="flex items-center text-gray-400 text-sm">
                  <span className="w-2 h-2 bg-gray-400 rounded-full mr-1"></span>
                  离线
                </span>
              )}

              <span className="text-xs text-gray-400">{agent.platform}</span>
            </div>
          </div>

          {agent.tags && agent.tags.length > 0 && (
            <div className="mt-2 flex gap-1">
              {agent.tags.map((tag) => (
                <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
