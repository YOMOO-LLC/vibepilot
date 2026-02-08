'use client';

import { useEditorStore } from '@/stores/editorStore';
import { MonacoEditor } from './MonacoEditor';
import { ImagePreview } from './ImagePreview';

export function EditorPanel() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        No file open
      </div>
    );
  }

  if (activeTab.loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500" data-testid="editor-loading">
        Loading...
      </div>
    );
  }

  if (activeTab.error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400" data-testid="editor-error">
        Error: {activeTab.error}
      </div>
    );
  }

  if (activeTab.mimeType.startsWith('image/')) {
    return <ImagePreview tab={activeTab} />;
  }

  return <MonacoEditor tab={activeTab} />;
}
