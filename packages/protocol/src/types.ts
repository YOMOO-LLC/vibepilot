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
}
