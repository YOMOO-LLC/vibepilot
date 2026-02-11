import type { FileNode } from '@vibepilot/protocol';
import { getFileIconUrl, getFolderIconUrl } from '@/lib/fileIcons';

interface FileTreeNodeProps {
  node: FileNode;
  expanded: Set<string>;
  childrenMap: Record<string, FileNode[]>;
  onToggle: (path: string) => void;
  onFileClick?: (path: string) => void;
  level: number;
}

export function FileTreeNode({
  node,
  expanded,
  childrenMap,
  onToggle,
  onFileClick,
  level,
}: FileTreeNodeProps) {
  const isDirectory = node.type === 'directory';
  const isExpanded = expanded.has(node.path);
  const children = childrenMap[node.path];

  const iconUrl = isDirectory ? getFolderIconUrl(node.name, isExpanded) : getFileIconUrl(node.name);

  const handleClick = () => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onFileClick?.(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          paddingLeft: `${level * 16 + 8}px`,
          paddingRight: '8px',
          paddingTop: '4px',
          paddingBottom: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          userSelect: 'none',
        }}
        className="hover:bg-zinc-800 rounded"
      >
        {isDirectory && (
          <span style={{ marginRight: '4px', fontSize: '10px', width: '12px' }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!isDirectory && <span style={{ width: '16px' }} />}
        <img
          src={iconUrl}
          alt=""
          width={16}
          height={16}
          style={{ marginRight: '6px', flexShrink: 0 }}
        />
        <span className="truncate">{node.name}</span>
      </div>

      {isDirectory && isExpanded && children && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              expanded={expanded}
              childrenMap={childrenMap}
              onToggle={onToggle}
              onFileClick={onFileClick}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
