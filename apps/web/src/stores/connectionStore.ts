import { create } from 'zustand';
import { type ConnectionState } from '@/lib/websocket';
import { type WebRTCState } from '@/lib/webrtc';
import { transportManager, type TransportType } from '@/lib/transport';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';

interface ConnectionStore {
  state: ConnectionState;
  webrtcState: WebRTCState;
  activeTransport: TransportType;
  url: string;
  connect: (url?: string) => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => {
  let prevState: ConnectionState = 'disconnected';

  return {
    state: 'disconnected',
    webrtcState: 'disconnected',
    activeTransport: 'websocket',
    url: 'ws://localhost:9800',

    connect: (url?: string) => {
      const baseUrl = url || get().url;
      if (url) {
        set({ url: baseUrl });
      }

      // Append auth token to WebSocket URL if available
      const connectUrl = useAuthStore.getState().getWsUrl(baseUrl);

      transportManager.connect(
        connectUrl,
        (state) => {
          set({ state });

          // Notify on connection state changes
          if (state === 'connected' && prevState !== 'connected') {
            useNotificationStore.getState().add('success', 'Connected to agent');
          } else if (state === 'disconnected' && prevState === 'connected') {
            useNotificationStore
              .getState()
              .add('warning', 'Disconnected from agent', 'Attempting to reconnect...');
          }
          prevState = state;
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
      prevState = 'disconnected';
      set({
        state: 'disconnected',
        webrtcState: 'disconnected',
        activeTransport: 'websocket',
      });
    },
  };
});
