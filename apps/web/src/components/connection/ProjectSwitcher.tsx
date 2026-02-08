'use client';

import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';

export function ProjectSwitcher() {
  const { projects, currentProject, loading, switchProject } = useProjectStore();
  const [open, setOpen] = useState(false);

  const handleSelect = (projectId: string) => {
    switchProject(projectId);
    setOpen(false);
  };

  return (
    <div className="relative" data-testid="project-switcher">
      {loading && (
        <span
          data-testid="project-switcher-loading"
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-500 animate-pulse"
        />
      )}
      <button
        data-testid="project-switcher-trigger"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
      >
        <span className="text-zinc-400">
          {currentProject ? currentProject.name : 'No project'}
        </span>
        <svg
          className={`w-3 h-3 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">No projects available</div>
          ) : (
            <ul className="py-1">
              {projects.map((project) => {
                const isActive = currentProject?.id === project.id;
                return (
                  <li key={project.id}>
                    <button
                      data-testid={`project-item-${project.id}`}
                      data-active={isActive ? 'true' : 'false'}
                      onClick={() => handleSelect(project.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-700 transition-colors ${
                        isActive ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-300'
                      }`}
                    >
                      <div>{project.name}</div>
                      <div className="text-xs text-zinc-500 truncate">{project.path}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
