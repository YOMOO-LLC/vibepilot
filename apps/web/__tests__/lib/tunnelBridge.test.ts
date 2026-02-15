import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTunnelUrl, initTunnelBridge } from '@/lib/tunnelBridge';

// Mock tunnelStore
const mockFetch = vi.fn();
const mockOpenTunnelForPort = vi.fn();
let mockStoreState: any = {
  tunnels: {},
  fetch: mockFetch,
  openTunnelForPort: mockOpenTunnelForPort,
};

vi.mock('@/stores/tunnelStore', () => ({
  useTunnelStore: {
    getState: () => mockStoreState,
  },
}));

// Mock transport to avoid import errors
vi.mock('@/lib/transport', () => ({
  transportManager: {
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
  },
}));

describe('tunnelBridge', () => {
  describe('getTunnelUrl', () => {
    it('generates tunnel URL for a port', () => {
      const url = getTunnelUrl(3000);
      expect(url).toBe('http://localhost:3000/__tunnel__/3000/');
    });

    it('generates tunnel URL with custom path', () => {
      const url = getTunnelUrl(8080, '/api/data');
      expect(url).toBe('http://localhost:3000/__tunnel__/8080/api/data');
    });

    it('defaults path to /', () => {
      const url = getTunnelUrl(3000);
      expect(url).toContain('/__tunnel__/3000/');
    });
  });

  describe('initTunnelBridge', () => {
    let messageHandler: ((event: any) => void) | null = null;

    beforeEach(() => {
      vi.clearAllMocks();
      messageHandler = null;

      // Reset bridge initialized state by re-importing
      // We mock navigator.serviceWorker
      const addEventListener = vi.fn((type: string, handler: any) => {
        if (type === 'message') {
          messageHandler = handler;
        }
      });

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          ...globalThis.navigator,
          serviceWorker: {
            addEventListener,
            register: vi.fn().mockResolvedValue({}),
          },
        },
        writable: true,
        configurable: true,
      });

      mockStoreState = {
        tunnels: {
          'port-3000': { tunnelId: 'port-3000', targetPort: 3000, state: 'open' },
        },
        fetch: mockFetch,
        openTunnelForPort: mockOpenTunnelForPort,
      };
    });

    it('handles tunnel-fetch messages from Service Worker', async () => {
      // Reset module to allow re-initialization
      vi.resetModules();
      const { initTunnelBridge: init } = await import('@/lib/tunnelBridge');
      init();

      expect(messageHandler).not.toBeNull();

      // Simulate SW message
      const responsePort = {
        postMessage: vi.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: btoa('<h1>Hello</h1>'),
      });

      await messageHandler!({
        data: {
          type: 'tunnel-fetch',
          port: 3000,
          path: '/',
          method: 'GET',
          headers: {},
        },
        ports: [responsePort],
      });

      expect(mockFetch).toHaveBeenCalledWith('port-3000', '/', {
        method: 'GET',
        headers: {},
        body: undefined,
      });

      expect(responsePort.postMessage).toHaveBeenCalledWith({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: btoa('<h1>Hello</h1>'),
      });
    });

    it('returns error when fetch fails', async () => {
      vi.resetModules();
      const { initTunnelBridge: init } = await import('@/lib/tunnelBridge');
      init();

      const responsePort = {
        postMessage: vi.fn(),
      };

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await messageHandler!({
        data: {
          type: 'tunnel-fetch',
          port: 3000,
          path: '/api/data',
          method: 'GET',
          headers: {},
        },
        ports: [responsePort],
      });

      expect(responsePort.postMessage).toHaveBeenCalledWith({
        error: 'Connection refused',
      });
    });

    it('ignores non-tunnel-fetch messages', async () => {
      vi.resetModules();
      const { initTunnelBridge: init } = await import('@/lib/tunnelBridge');
      init();

      // Should not throw for other message types
      await messageHandler!({
        data: { type: 'other-message' },
        ports: [],
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error when tunnel has error state', async () => {
      vi.resetModules();

      mockStoreState = {
        tunnels: {
          'port-3000': {
            tunnelId: 'port-3000',
            targetPort: 3000,
            state: 'error',
            error: 'Connection refused',
          },
        },
        fetch: mockFetch,
        openTunnelForPort: mockOpenTunnelForPort,
      };

      const { initTunnelBridge: init } = await import('@/lib/tunnelBridge');
      init();

      const responsePort = {
        postMessage: vi.fn(),
      };

      await messageHandler!({
        data: {
          type: 'tunnel-fetch',
          port: 3000,
          path: '/',
          method: 'GET',
          headers: {},
        },
        ports: [responsePort],
      });

      expect(responsePort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Connection refused'),
        })
      );
    });
  });
});
