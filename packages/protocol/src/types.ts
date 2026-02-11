export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  // Metadata
  lastAccessed?: number; // 时间戳
  favorite?: boolean;
  color?: string; // UI 标识色
  tags?: string[];
  createdAt?: number;
}
