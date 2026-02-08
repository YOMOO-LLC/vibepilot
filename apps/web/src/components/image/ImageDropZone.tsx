'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { transportManager } from '@/lib/transport';
import { MessageType, type VPMessage } from '@vibepilot/protocol';
import { useTerminalStore } from '@/stores/terminalStore';

interface ImageDropZoneProps {
  children: ReactNode;
}

// Chunk size must be divisible by 3 so base64 encoding of each chunk
// has no padding ('='), allowing clean concatenation on the server.
const CHUNK_SIZE = 63 * 1024; // 63KB (divisible by 3)

// File types Claude Code can process
const SUPPORTED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
]);

function isSupported(file: File): boolean {
  if (SUPPORTED_TYPES.has(file.type)) return true;
  // Fallback: check extension for files with missing MIME
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg'
    || ext === 'gif' || ext === 'webp';
}

export function ImageDropZone({ children }: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFile = async (file: File) => {
    if (!isSupported(file)) {
      return;
    }

    const transferId = `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get current terminal session ID for the image:saved response
    const { activeTabId, tabs } = useTerminalStore.getState();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const sessionId = activeTab?.sessionId || 'default';

    const reader = new FileReader();

    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const totalSize = arrayBuffer.byteLength;

      // Send start message
      transportManager.send(MessageType.IMAGE_START, {
        transferId,
        sessionId,
        filename: file.name,
        totalSize,
        mimeType: file.type,
      });

      // Split into chunks and send
      const numChunks = Math.ceil(totalSize / CHUNK_SIZE);
      for (let i = 0; i < numChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = arrayBuffer.slice(start, end);

        // Convert to base64 (chunked to avoid stack overflow with spread operator)
        const uint8 = new Uint8Array(chunk);
        let binary = '';
        for (let j = 0; j < uint8.length; j++) {
          binary += String.fromCharCode(uint8[j]);
        }
        const base64 = btoa(binary);

        transportManager.send(MessageType.IMAGE_CHUNK, {
          transferId,
          chunkIndex: i,
          data: base64,
        });
      }

      // Send complete message
      transportManager.send(MessageType.IMAGE_COMPLETE, {
        transferId,
      });
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current += 1;

    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current -= 1;

    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && isSupported(file)) {
          e.preventDefault();
          // Generate a filename for pasted files without a meaningful name
          if (!file.name || file.name === 'image.png') {
            const timestamp = Date.now();
            const ext = file.type.split('/')[1] || 'bin';
            const renamedFile = new File([file], `pasted-${timestamp}.${ext}`, {
              type: file.type,
            });
            handleFile(renamedFile);
          } else {
            handleFile(file);
          }
          break;
        }
      }
    }
  };

  // Listen for IMAGE_SAVED to write file path into terminal
  useEffect(() => {
    const unsub = transportManager.on(MessageType.IMAGE_SAVED, (msg: VPMessage) => {
      const { sessionId, filePath } = msg.payload as { sessionId: string; filePath: string };
      // Write the file path into the terminal so Claude Code can read it
      try {
        transportManager.send(MessageType.TERMINAL_INPUT, {
          sessionId,
          data: filePath,
        });
      } catch {
        // Terminal might not be active
      }
    });

    document.addEventListener('paste', handlePaste as any);

    return () => {
      unsub();
      document.removeEventListener('paste', handlePaste as any);
    };
  }, []);

  return (
    <div
      onDragEnter={handleDragEnter as any}
      onDragLeave={handleDragLeave as any}
      onDragOver={handleDragOver as any}
      onDrop={handleDrop as any}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {children}

      {isDragging && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 100, 255, 0.1)',
            border: '2px dashed #0066ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '20px 40px',
              borderRadius: '8px',
              fontSize: '18px',
            }}
          >
            Drop file here (image / PDF)
          </div>
        </div>
      )}
    </div>
  );
}
