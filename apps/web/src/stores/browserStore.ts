import { create } from 'zustand';
import { transportManager } from '@/lib/transport';
import { detectPorts } from '@/lib/portDetector';
import type { BrowserInputPayload } from '@vibepilot/protocol';
import { useNotificationStore } from '@/stores/notificationStore';

type BrowserState = 'idle' | 'starting' | 'running' | 'error';

interface BrowserStore {
  state: BrowserState;
  currentUrl: string;
  pageTitle: string;
  viewportWidth: number;
  viewportHeight: number;
  error: string | null;
  remoteCursor: string;
  latestFrame: string | null;
  detectedPorts: string[];

  start: (url?: string) => void;
  stop: () => void;
  navigate: (url: string) => void;
  sendInput: (input: BrowserInputPayload) => void;
  resize: (width: number, height: number) => void;
  dismissPort: (url: string) => void;
}

export const useBrowserStore = create<BrowserStore>((set, get) => {
  // Register message handlers (same pattern as editorStore, fileTreeStore)
  transportManager.on('browser:started', (msg: any) => {
    set({
      state: 'running',
      viewportWidth: msg.payload.viewportWidth,
      viewportHeight: msg.payload.viewportHeight,
      error: null,
    });
  });

  transportManager.on('browser:error', (msg: any) => {
    useNotificationStore.getState().add('error', 'Browser preview error', msg.payload.error);
    set({
      state: 'error',
      error: msg.payload.error,
    });
  });

  transportManager.on('browser:frame', (msg: any) => {
    set({
      latestFrame: msg.payload.data,
      currentUrl: msg.payload.metadata.pageUrl,
      pageTitle: msg.payload.metadata.pageTitle,
    });
  });

  transportManager.on('browser:stopped', () => {
    set({
      state: 'idle',
      latestFrame: null,
      error: null,
    });
  });

  transportManager.on('browser:navigated', (msg: any) => {
    set({
      currentUrl: msg.payload.url,
      pageTitle: msg.payload.title,
    });
  });

  transportManager.on('browser:cursor', (msg: any) => {
    set({ remoteCursor: msg.payload.cursor });
  });

  transportManager.on('terminal:output', (msg: any) => {
    const ports = detectPorts(msg.payload.data);
    if (ports.length === 0) return;
    const current = get().detectedPorts;
    const merged = [...new Set([...current, ...ports])];
    if (merged.length !== current.length) {
      set({ detectedPorts: merged });
    }
  });

  return {
    state: 'idle',
    currentUrl: '',
    pageTitle: '',
    viewportWidth: 1280,
    viewportHeight: 720,
    error: null,
    remoteCursor: 'default',
    latestFrame: null,
    detectedPorts: [],

    start: (url?: string) => {
      const { viewportWidth, viewportHeight, detectedPorts } = get();
      set({
        state: 'starting',
        error: null,
        detectedPorts: url ? detectedPorts.filter((p) => p !== url) : detectedPorts,
      });
      transportManager.send('browser:start', {
        url,
        width: viewportWidth,
        height: viewportHeight,
        quality: 70,
      });
    },

    stop: () => {
      transportManager.send('browser:stop', {});
    },

    navigate: (url: string) => {
      transportManager.send('browser:navigate', { url });
    },

    sendInput: (input: BrowserInputPayload) => {
      transportManager.send('browser:input', input);
    },

    resize: (width: number, height: number) => {
      set({ viewportWidth: width, viewportHeight: height });
      if (get().state === 'running') {
        transportManager.send('browser:resize', { width, height });
      }
    },

    dismissPort: (url: string) => {
      set({ detectedPorts: get().detectedPorts.filter((p) => p !== url) });
    },
  };
});
