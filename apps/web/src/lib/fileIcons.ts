import { getIconForFile, getIconForFolder, getIconForOpenFolder } from 'vscode-icons-js';

const ICON_CDN_BASE = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';

export function getFileIconUrl(filename: string): string {
  const icon = getIconForFile(filename);
  if (!icon) return `${ICON_CDN_BASE}/default_file.svg`;
  return `${ICON_CDN_BASE}/${icon}`;
}

export function getFolderIconUrl(name: string, isOpen: boolean): string {
  const icon = isOpen ? getIconForOpenFolder(name) : getIconForFolder(name);
  return `${ICON_CDN_BASE}/${icon}`;
}
