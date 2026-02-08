'use client';

import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { transportManager } from '@/lib/transport';
import { MessageType, type VPMessage } from '@vibepilot/protocol';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';

export interface UseTerminalOptions {
  sessionId: string;
}

export function useTerminal({ sessionId }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const createdRef = useRef(false);
  const connectionState = useConnectionStore((s) => s.state);

  const sendTerminalCreateOrAttach = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal || createdRef.current) return;

    const tab = useTerminalStore.getState().tabs.find(t => t.sessionId === sessionId);
    const needsAttach = tab?.needsAttach;

    try {
      const { cols, rows } = terminal;
      if (needsAttach) {
        transportManager.send(MessageType.TERMINAL_ATTACH, {
          sessionId,
          cols,
          rows,
        });
      } else {
        transportManager.send(MessageType.TERMINAL_CREATE, {
          sessionId,
          cols,
          rows,
        });
      }
      createdRef.current = true;
    } catch {
      // Not connected yet
    }
  }, [sessionId]);

  // When connection becomes 'connected', send terminal:create or terminal:attach
  useEffect(() => {
    if (connectionState === 'connected' && terminalRef.current && !createdRef.current) {
      sendTerminalCreateOrAttach();
    }
  }, [connectionState, sendTerminalCreateOrAttach]);

  const attach = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    containerRef.current = container;

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#09090b',
        foreground: '#fafafa',
        cursor: '#fafafa',
        selectionBackground: '#27272a',
      },
    });
    terminalRef.current = terminal;

    // Addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Mount
    terminal.open(container);
    terminal.loadAddon(new CanvasAddon());
    fitAddon.fit();

    // Send input to agent via transport (WebRTC if available, fallback WS)
    const inputDisposable = terminal.onData((data) => {
      try {
        transportManager.send(MessageType.TERMINAL_INPUT, {
          sessionId,
          data,
        });
      } catch {
        // Not connected
      }
    });

    // Listen for output from agent via transport (from either WS or WebRTC)
    const unsubOutput = transportManager.on(MessageType.TERMINAL_OUTPUT, (msg: VPMessage) => {
      if (msg.payload && (msg.payload as any).sessionId === sessionId) {
        terminal.write((msg.payload as any).data);
      }
    });

    // Listen for terminal:attached — write buffered output and clear needsAttach
    const unsubAttached = transportManager.on(MessageType.TERMINAL_ATTACHED, (msg: VPMessage) => {
      const payload = msg.payload as any;
      if (payload?.sessionId === sessionId) {
        if (payload.bufferedOutput) {
          terminal.write(payload.bufferedOutput);
        }
        useTerminalStore.getState().clearNeedsAttach(
          useTerminalStore.getState().tabs.find(t => t.sessionId === sessionId)?.id ?? ''
        );
      }
    });

    // Listen for terminal:destroyed with exitCode=-1 (attach failed) — fallback to create
    const unsubDestroyed = transportManager.on(MessageType.TERMINAL_DESTROYED, (msg: VPMessage) => {
      const payload = msg.payload as any;
      if (payload?.sessionId === sessionId && payload?.exitCode === -1) {
        // Attach failed, clear needsAttach and send create
        const tab = useTerminalStore.getState().tabs.find(t => t.sessionId === sessionId);
        if (tab) {
          useTerminalStore.getState().clearNeedsAttach(tab.id);
        }
        createdRef.current = false;
        try {
          const { cols, rows } = terminal;
          transportManager.send(MessageType.TERMINAL_CREATE, {
            sessionId,
            cols,
            rows,
          });
          createdRef.current = true;
        } catch {
          // Not connected
        }
      }
    });

    // Listen for cwd changes from agent
    const unsubCwd = transportManager.on(MessageType.TERMINAL_CWD, (msg: VPMessage) => {
      if (msg.payload && (msg.payload as any).sessionId === sessionId) {
        useTerminalStore.getState().setCwd(sessionId, (msg.payload as any).cwd);
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = terminal;
      try {
        transportManager.send(MessageType.TERMINAL_RESIZE, {
          sessionId,
          cols,
          rows,
        });
      } catch {
        // Not connected
      }
    });
    resizeObserver.observe(container);

    // Request terminal creation or attach on agent (if already connected)
    sendTerminalCreateOrAttach();

    cleanupRef.current = () => {
      inputDisposable.dispose();
      unsubOutput();
      unsubAttached();
      unsubDestroyed();
      unsubCwd();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      createdRef.current = false;
    };
  }, [sessionId, sendTerminalCreateOrAttach]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return { attach, terminalRef, fitAddonRef };
}
