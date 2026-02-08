import type { ProjectInfo } from '@vibepilot/protocol';
import { ProjectCard } from './ProjectCard';

interface ProjectGridProps {
  projects: ProjectInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfirm: (id: string) => void;
  loading?: boolean;
}

export function ProjectGrid({
  projects,
  selectedId,
  onSelect,
  onConfirm,
  loading = false,
}: ProjectGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          selected={project.id === selectedId}
          onSelect={() => onSelect(project.id)}
          onConfirm={() => onConfirm(project.id)}
          disabled={loading}
        />
      ))}
    </div>
  );
}
