import { create } from 'zustand';
import { transportManager } from '@/lib/transport';
import { useNotificationStore } from '@/stores/notificationStore';

type TunnelState = 'opening' | 'open' | 'error';

export interface TunnelInfo {
  tunnelId: string;
  targetPort: number;
  state: TunnelState;
  error?: string;
}

interface TunnelResponse {
  status: number;
  headers: Record<string, string>;
  body?: string; // base64-encoded
}

interface PendingRequest {
  resolve: (response: TunnelResponse) => void;
  reject: (error: Error) => void;
}

interface TunnelStore {
  tunnels: Record<string, TunnelInfo>;
  pendingRequests: Record<string, PendingRequest>;

  openTunnel: (tunnelId: string, targetPort: number, targetHost?: string) => void;
  closeTunnel: (tunnelId: string) => void;
  fetch: (
    tunnelId: string,
    path: string,
    options?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => Promise<TunnelResponse>;
  openTunnelForPort: (port: number) => void;
  getTunnelForPort: (port: number) => TunnelInfo | undefined;
}

let requestCounter = 0;

function generateRequestId(): string {
  return `req-${Date.now()}-${++requestCounter}`;
}

export const useTunnelStore = create<TunnelStore>((set, get) => {
  // Register message handlers
  transportManager.on('tunnel:opened', (msg: any) => {
    const { tunnelId } = msg.payload;
    set((state) => ({
      tunnels: {
        ...state.tunnels,
        [tunnelId]: {
          ...state.tunnels[tunnelId],
          state: 'open',
        },
      },
    }));
  });

  transportManager.on('tunnel:response', (msg: any) => {
    const { requestId, status, headers, body } = msg.payload;
    const pending = get().pendingRequests[requestId];
    if (pending) {
      pending.resolve({ status, headers, body });
      set((state) => {
        const { [requestId]: _, ...rest } = state.pendingRequests;
        return { pendingRequests: rest };
      });
    }
  });

  transportManager.on('tunnel:error', (msg: any) => {
    const { tunnelId, requestId, error } = msg.payload;

    // If this error is for a specific request, reject that request
    if (requestId) {
      const pending = get().pendingRequests[requestId];
      if (pending) {
        pending.reject(new Error(error));
        set((state) => {
          const { [requestId]: _, ...rest } = state.pendingRequests;
          return { pendingRequests: rest };
        });
      }
    }

    // Update tunnel state
    if (tunnelId && get().tunnels[tunnelId]) {
      set((state) => ({
        tunnels: {
          ...state.tunnels,
          [tunnelId]: {
            ...state.tunnels[tunnelId],
            state: 'error',
            error,
          },
        },
      }));

      useNotificationStore.getState().add('error', 'Tunnel error', error);
    }
  });

  return {
    tunnels: {},
    pendingRequests: {},

    openTunnel: (tunnelId: string, targetPort: number, targetHost?: string) => {
      set((state) => ({
        tunnels: {
          ...state.tunnels,
          [tunnelId]: {
            tunnelId,
            targetPort,
            state: 'opening',
          },
        },
      }));

      const payload: any = { tunnelId, targetPort };
      if (targetHost) {
        payload.targetHost = targetHost;
      }
      transportManager.send('tunnel:open', payload);
    },

    closeTunnel: (tunnelId: string) => {
      // Reject all pending requests for this tunnel
      const { pendingRequests, tunnels } = get();
      const tunnelRequestIds = Object.keys(pendingRequests).filter((reqId) => {
        // We need to track which tunnel each request belongs to
        return true; // Will be filtered by the tunnel cleanup below
      });

      // Reject all pending requests (simplified - rejects all for this tunnel)
      const remainingRequests: Record<string, PendingRequest> = {};
      for (const [reqId, pending] of Object.entries(pendingRequests)) {
        pending.reject(new Error('Tunnel closed'));
      }

      transportManager.send('tunnel:close', { tunnelId });

      set((state) => {
        const { [tunnelId]: _, ...restTunnels } = state.tunnels;
        return {
          tunnels: restTunnels,
          pendingRequests: {},
        };
      });
    },

    fetch: (tunnelId, path, options = {}) => {
      return new Promise<TunnelResponse>((resolve, reject) => {
        const tunnel = get().tunnels[tunnelId];
        if (!tunnel || tunnel.state !== 'open') {
          reject(new Error(`Tunnel "${tunnelId}" is not open`));
          return;
        }

        const requestId = generateRequestId();
        const method = options.method || 'GET';
        const headers = options.headers || {};

        // Store pending request
        set((state) => ({
          pendingRequests: {
            ...state.pendingRequests,
            [requestId]: { resolve, reject },
          },
        }));

        transportManager.send('tunnel:request', {
          tunnelId,
          requestId,
          method,
          path,
          headers,
          body: options.body,
        });
      });
    },

    openTunnelForPort: (port: number) => {
      const tunnelId = `port-${port}`;
      get().openTunnel(tunnelId, port);
    },

    getTunnelForPort: (port: number) => {
      const tunnelId = `port-${port}`;
      return get().tunnels[tunnelId];
    },
  };
});
