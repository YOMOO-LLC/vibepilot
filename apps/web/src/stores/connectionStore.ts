import { create } from 'zustand';
import { type ConnectionState } from '@/lib/websocket';
import { type WebRTCState } from '@/lib/webrtc';
import { transportManager, type TransportType } from '@/lib/transport';

interface ConnectionStore {
  state: ConnectionState;
  webrtcState: WebRTCState;
  activeTransport: TransportType;
  url: string;
  connect: (url?: string) => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  state: 'disconnected',
  webrtcState: 'disconnected',
  activeTransport: 'websocket',
  url: 'ws://localhost:9800',

  connect: (url?: string) => {
    const connectUrl = url || get().url;
    if (url) {
      set({ url: connectUrl });
    }
    transportManager.connect(
      connectUrl,
      (state) => {
        set({ state });
      },
      (webrtcState) => {
        set({ webrtcState });
      },
      (activeTransport) => {
        set({ activeTransport });
      }
    );
  },

  disconnect: () => {
    transportManager.disconnect();
    set({
      state: 'disconnected',
      webrtcState: 'disconnected',
      activeTransport: 'websocket',
    });
  },
}));
