'use client';

import { useTunnelStore } from '@/stores/tunnelStore';

/**
 * TunnelBridge listens for Service Worker messages and forwards
 * tunnel-fetch requests through the tunnelStore.
 *
 * This bridges the Service Worker (which intercepts /__tunnel__/<port>/<path>)
 * with the WebRTC tunnel transport.
 */

let bridgeInitialized = false;

export function initTunnelBridge(): void {
  if (bridgeInitialized) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  bridgeInitialized = true;

  navigator.serviceWorker.addEventListener('message', async (event) => {
    if (event.data?.type !== 'tunnel-fetch') return;

    const { port, path, method, headers, body } = event.data;
    const responsePort = event.ports[0];
    if (!responsePort) return;

    const tunnelId = `port-${port}`;
    const store = useTunnelStore.getState();

    // Auto-open tunnel if not already open
    const tunnel = store.tunnels[tunnelId];
    if (!tunnel) {
      store.openTunnelForPort(port);
      // Wait for tunnel to open (with timeout)
      const opened = await waitForTunnelOpen(tunnelId, 5000);
      if (!opened) {
        responsePort.postMessage({ error: `Failed to open tunnel to port ${port}` });
        return;
      }
    } else if (tunnel.state === 'opening') {
      const opened = await waitForTunnelOpen(tunnelId, 5000);
      if (!opened) {
        responsePort.postMessage({ error: `Tunnel to port ${port} timed out` });
        return;
      }
    } else if (tunnel.state === 'error') {
      responsePort.postMessage({ error: `Tunnel to port ${port}: ${tunnel.error}` });
      return;
    }

    try {
      const response = await useTunnelStore.getState().fetch(tunnelId, path, {
        method,
        headers,
        body,
      });

      responsePort.postMessage({
        status: response.status,
        headers: response.headers,
        body: response.body,
      });
    } catch (err: any) {
      responsePort.postMessage({ error: err.message });
    }
  });
}

function waitForTunnelOpen(tunnelId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const tunnel = useTunnelStore.getState().tunnels[tunnelId];
      if (tunnel?.state === 'open') {
        resolve(true);
        return;
      }
      if (tunnel?.state === 'error' || Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Get the tunnel URL for a given port.
 * This URL can be opened in an iframe or new tab.
 */
export function getTunnelUrl(port: number, path: string = '/'): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  return `${origin}/__tunnel__/${port}${path}`;
}
