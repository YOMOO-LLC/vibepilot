'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useBrowserStore } from '@/stores/browserStore';
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewPlaceholder } from './PreviewPlaceholder';

export function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, latestFrame, remoteCursor, viewportWidth, viewportHeight, sendInput } =
    useBrowserStore();

  // Render frame on canvas
  useEffect(() => {
    if (!latestFrame || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
    };
    img.src = `data:image/jpeg;base64,${latestFrame}`;
  }, [latestFrame]);

  const toRemote = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round(((e.clientX - rect.left) / rect.width) * viewportWidth),
        y: Math.round(((e.clientY - rect.top) / rect.height) * viewportHeight),
      };
    },
    [viewportWidth, viewportHeight]
  );

  const getModifiers = (e: React.KeyboardEvent | React.MouseEvent) =>
    (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

  if (state !== 'running') {
    return <PreviewPlaceholder />;
  }

  return (
    <div className="flex flex-col h-full">
      <PreviewToolbar />
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        width={viewportWidth}
        height={viewportHeight}
        tabIndex={0}
        style={{ cursor: remoteCursor, width: '100%', height: '100%', objectFit: 'contain' }}
        onMouseDown={(e) => {
          e.preventDefault();
          canvasRef.current?.focus();
          const pos = toRemote(e);
          sendInput({
            type: 'mousePressed',
            ...pos,
            button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
            clickCount: e.detail,
            modifiers: getModifiers(e),
          });
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          const pos = toRemote(e);
          sendInput({
            type: 'mouseReleased',
            ...pos,
            button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
            clickCount: e.detail,
            modifiers: getModifiers(e),
          });
        }}
        onMouseMove={(e) => {
          const pos = toRemote(e);
          sendInput({ type: 'mouseMoved', ...pos, modifiers: getModifiers(e) });
        }}
        onWheel={(e) => {
          e.preventDefault();
          const pos = toRemote(e);
          sendInput({
            type: 'mouseWheel',
            ...pos,
            deltaX: e.deltaX,
            deltaY: e.deltaY,
          });
        }}
        onKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          sendInput({
            type: 'keyDown',
            key: e.key,
            code: e.code,
            modifiers: getModifiers(e),
          });
          // For printable characters without ctrl/meta, send insertText so CDP inserts the character
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            sendInput({ type: 'insertText', text: e.key });
          }
        }}
        onKeyUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          sendInput({
            type: 'keyUp',
            key: e.key,
            code: e.code,
            modifiers: getModifiers(e),
          });
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
