'use client';

import type { EditorTab } from '@/stores/editorStore';

interface ImagePreviewProps {
  tab: EditorTab;
}

export function ImagePreview({ tab }: ImagePreviewProps) {
  const src = `data:${tab.mimeType};base64,${tab.content}`;

  return (
    <div
      className="flex items-center justify-center h-full bg-zinc-900 p-4"
      data-testid="image-preview"
    >
      <img
        src={src}
        alt={tab.fileName}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
