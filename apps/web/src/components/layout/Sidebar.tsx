'use client';

interface SidebarProps {
  children: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  return (
    <div className="flex flex-col h-full" data-testid="sidebar">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Explorer</span>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
