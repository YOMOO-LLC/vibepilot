'use client';

import { useState, useMemo, useEffect } from 'react';
import type { ProjectInfo } from '@vibepilot/protocol';
import { ProjectGrid } from './ProjectGrid';
import { EmptyProjectState } from './EmptyProjectState';

interface ProjectSelectorModalProps {
  open: boolean;
  projects: ProjectInfo[];
  loading: boolean;
  error: string | null;
  onSelectProject: (projectId: string) => void;
}

export function ProjectSelectorModal({
  open,
  projects,
  loading,
  error,
  onSelectProject,
}: ProjectSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 过滤项目
  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q) ||
        (p.tags && p.tags.some((tag) => tag.toLowerCase().includes(q)))
    );
  }, [projects, searchQuery]);

  // 重置选择当项目列表变化时
  useEffect(() => {
    if (filteredProjects.length > 0 && !selectedId) {
      setSelectedId(filteredProjects[0].id);
    }
  }, [filteredProjects, selectedId]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selectedId) {
        e.preventDefault();
        onSelectProject(selectedId);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredProjects.length === 0) return;

        const currentIndex = selectedId
          ? filteredProjects.findIndex((p) => p.id === selectedId)
          : -1;

        let nextIndex: number;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex + 1;
          if (nextIndex >= filteredProjects.length) nextIndex = 0;
        } else {
          nextIndex = currentIndex - 1;
          if (nextIndex < 0) nextIndex = filteredProjects.length - 1;
        }

        setSelectedId(filteredProjects[nextIndex].id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // 不关闭选择器，因为这是阻塞模态框
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, selectedId, filteredProjects, onSelectProject]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl px-8">
        <h1 className="text-4xl font-bold text-zinc-100 mb-6">Select a Project</h1>

        {/* 搜索框（项目数 > 4 时显示） */}
        {projects.length > 4 && (
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 mb-6"
            autoFocus
          />
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* 加载状态 */}
        {loading && !error && (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-zinc-700 border-t-blue-500"></div>
            <p className="mt-4 text-zinc-500">Loading...</p>
          </div>
        )}

        {/* 项目网格或空状态 */}
        {!loading && filteredProjects.length === 0 ? (
          <EmptyProjectState hasSearch={!!searchQuery} />
        ) : (
          !loading && (
            <ProjectGrid
              projects={filteredProjects}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onConfirm={onSelectProject}
              loading={loading}
            />
          )
        )}
      </div>
    </div>
  );
}
