'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useBrowserStore } from '@/stores/browserStore';
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewPlaceholder } from './PreviewPlaceholder';

export function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const { state, latestFrame, remoteCursor, viewportWidth, viewportHeight, sendInput } =
    useBrowserStore();

  // Render frame on canvas
  useEffect(() => {
    if (!latestFrame || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Reuse a single Image instance to reduce GC pressure
    if (!imgRef.current) {
      imgRef.current = new Image();
    }
    const img = imgRef.current;
    const canvas = canvasRef.current;

    img.onload = () => {
      // Guard against unmount
      if (canvas) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    };
    img.src = `data:image/jpeg;base64,${latestFrame}`;

    return () => {
      // Cancel pending load
      img.onload = null;
    };
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

  const getModifiers = (e: {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

  // Native wheel listener with passive: false so preventDefault() works
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * viewportWidth;
      const y = ((e.clientY - rect.top) / rect.height) * viewportHeight;
      sendInput({
        type: 'mouseWheel',
        x,
        y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        modifiers: getModifiers(e),
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [viewportWidth, viewportHeight]);

  // Cleanup pending requestAnimationFrame on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

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
          // Throttle to one event per animation frame
          if (rafIdRef.current !== null) return;
          const pos = toRemote(e);
          const mods = getModifiers(e);
          rafIdRef.current = requestAnimationFrame(() => {
            sendInput({ type: 'mouseMoved', ...pos, modifiers: mods });
            rafIdRef.current = null;
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
