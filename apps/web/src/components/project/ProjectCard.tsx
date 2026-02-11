import type { ProjectInfo } from '@vibepilot/protocol';

interface ProjectCardProps {
  project: ProjectInfo;
  selected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}

export function ProjectCard({
  project,
  selected,
  onSelect,
  onConfirm,
  disabled = false,
}: ProjectCardProps) {
  return (
    <button
      onClick={() => {
        onSelect();
        onConfirm();
      }}
      onMouseEnter={onSelect}
      disabled={disabled}
      className={`
        relative p-6 rounded-lg border-2 transition-all text-left w-full
        ${
          selected
            ? 'border-blue-500 bg-blue-500/10 shadow-lg'
            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      role="option"
      aria-selected={selected}
    >
      {/* 项目图标 */}
      <div
        className="mb-4 w-12 h-12 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: project.color || '#27272a',
        }}
      >
        <svg
          className="w-6 h-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      </div>

      {/* 项目名称 */}
      <h3 className="text-lg font-semibold mb-2 truncate text-zinc-100">
        {project.name}
        {project.favorite && <span className="ml-2 text-yellow-500">★</span>}
      </h3>

      {/* 项目路径 */}
      <p className="text-sm truncate text-zinc-500 mb-2">{project.path}</p>

      {/* 标签 */}
      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {project.tags.map((tag) => (
            <span key={tag} className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 选中指示器 */}
      {selected && (
        <div className="absolute top-3 right-3">
          <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </button>
  );
}
