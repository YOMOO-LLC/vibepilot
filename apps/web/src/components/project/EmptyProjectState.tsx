interface EmptyProjectStateProps {
  hasSearch: boolean;
}

export function EmptyProjectState({ hasSearch }: EmptyProjectStateProps) {
  return (
    <div className="text-center py-16">
      <svg
        className="w-16 h-16 mx-auto mb-4 text-zinc-600"
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

      <h3 className="text-xl font-semibold text-zinc-300 mb-2">
        {hasSearch ? 'No matching projects' : 'No projects configured'}
      </h3>

      <p className="text-zinc-500 mb-6">
        {hasSearch
          ? 'Try adjusting your search query'
          : 'Configure projects using the VibePilot CLI'}
      </p>

      {!hasSearch && (
        <code className="inline-block px-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-400 text-sm">
          vibepilot project:add "MyProject" /path/to/project
        </code>
      )}
    </div>
  );
}
