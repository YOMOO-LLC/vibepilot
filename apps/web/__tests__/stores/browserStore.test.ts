import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBrowserStore } from '@/stores/browserStore';

// Mock transport (same pattern as editorStore.test.ts)
vi.mock('@/lib/transport', () => {
  const handlers = new Map<string, Set<(msg: any) => void>>();

  const mockTransportManager = {
    send: vi.fn(),
    on: (type: string, handler: (msg: any) => void) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    _trigger: (type: string, payload: any) => {
      const typeHandlers = handlers.get(type);
      if (typeHandlers) {
        typeHandlers.forEach((handler) => handler({ type, payload }));
      }
    },
    _clear: () => {
      handlers.clear();
    },
  };

  return {
    transportManager: mockTransportManager,
  };
});

describe('browserStore', () => {
  let mockTransport: any;

  beforeEach(async () => {
    const transport = await import('@/lib/transport');
    mockTransport = transport.transportManager;

    useBrowserStore.setState({
      state: 'idle',
      currentUrl: '',
      pageTitle: '',
      viewportWidth: 1280,
      viewportHeight: 720,
      error: null,
      remoteCursor: 'default',
      latestFrame: null,
      detectedPorts: [],
    });

    vi.clearAllMocks();
  });

  it('initial state is idle', () => {
    const state = useBrowserStore.getState();
    expect(state.state).toBe('idle');
    expect(state.latestFrame).toBeNull();
  });

  it('start() sends browser:start and sets state to starting', () => {
    useBrowserStore.getState().start('http://localhost:3000');

    expect(useBrowserStore.getState().state).toBe('starting');
    expect(mockTransport.send).toHaveBeenCalledWith('browser:start', {
      url: 'http://localhost:3000',
      width: 1280,
      height: 720,
      quality: 70,
    });
  });

  it('handles browser:started message', () => {
    useBrowserStore.getState().start();

    mockTransport._trigger('browser:started', {
      cdpPort: 9222,
      viewportWidth: 1280,
      viewportHeight: 720,
    });

    const state = useBrowserStore.getState();
    expect(state.state).toBe('running');
    expect(state.viewportWidth).toBe(1280);
  });

  it('handles browser:error message', () => {
    useBrowserStore.getState().start();

    mockTransport._trigger('browser:error', {
      error: 'Chrome not found',
      code: 'CHROME_NOT_FOUND',
    });

    const state = useBrowserStore.getState();
    expect(state.state).toBe('error');
    expect(state.error).toBe('Chrome not found');
  });

  it('handles browser:frame message', () => {
    useBrowserStore.setState({ state: 'running' });

    mockTransport._trigger('browser:frame', {
      data: 'base64framedata',
      encoding: 'jpeg',
      timestamp: 12345,
      metadata: {
        width: 1280,
        height: 720,
        pageUrl: 'http://localhost:3000',
        pageTitle: 'My App',
      },
    });

    const state = useBrowserStore.getState();
    expect(state.latestFrame).toBe('base64framedata');
    expect(state.currentUrl).toBe('http://localhost:3000');
    expect(state.pageTitle).toBe('My App');
  });

  it('stop() sends browser:stop', () => {
    useBrowserStore.setState({ state: 'running' });
    useBrowserStore.getState().stop();

    expect(mockTransport.send).toHaveBeenCalledWith('browser:stop', {});
  });

  it('handles browser:stopped message', () => {
    useBrowserStore.setState({ state: 'running' });

    mockTransport._trigger('browser:stopped', {});

    expect(useBrowserStore.getState().state).toBe('idle');
    expect(useBrowserStore.getState().latestFrame).toBeNull();
  });

  it('sendInput sends browser:input', () => {
    useBrowserStore.setState({ state: 'running' });

    useBrowserStore.getState().sendInput({
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });

    expect(mockTransport.send).toHaveBeenCalledWith('browser:input', {
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });
  });

  it('navigate sends browser:navigate', () => {
    useBrowserStore.setState({ state: 'running' });
    useBrowserStore.getState().navigate('http://localhost:3000/about');

    expect(mockTransport.send).toHaveBeenCalledWith('browser:navigate', {
      url: 'http://localhost:3000/about',
    });
  });

  it('handles browser:navigated message', () => {
    useBrowserStore.setState({ state: 'running' });

    mockTransport._trigger('browser:navigated', {
      url: 'http://localhost:3000/about',
      title: 'About Page',
    });

    const state = useBrowserStore.getState();
    expect(state.currentUrl).toBe('http://localhost:3000/about');
    expect(state.pageTitle).toBe('About Page');
  });

  it('handles browser:cursor message', () => {
    mockTransport._trigger('browser:cursor', { cursor: 'pointer' });
    expect(useBrowserStore.getState().remoteCursor).toBe('pointer');
  });

  it('detects ports from terminal:output', () => {
    mockTransport._trigger('terminal:output', {
      sessionId: 's1',
      data: 'Local: http://localhost:3000/',
    });

    expect(useBrowserStore.getState().detectedPorts).toEqual(['http://localhost:3000']);
  });

  it('deduplicates detected ports', () => {
    mockTransport._trigger('terminal:output', {
      sessionId: 's1',
      data: 'http://localhost:3000',
    });
    mockTransport._trigger('terminal:output', {
      sessionId: 's1',
      data: 'http://localhost:3000',
    });

    expect(useBrowserStore.getState().detectedPorts).toEqual(['http://localhost:3000']);
  });

  it('dismissPort removes port', () => {
    mockTransport._trigger('terminal:output', {
      sessionId: 's1',
      data: 'http://localhost:3000 http://localhost:4000',
    });

    useBrowserStore.getState().dismissPort('http://localhost:3000');
    expect(useBrowserStore.getState().detectedPorts).toEqual(['http://localhost:4000']);
  });

  it('start(url) clears from detectedPorts', () => {
    mockTransport._trigger('terminal:output', {
      sessionId: 's1',
      data: 'http://localhost:3000',
    });

    useBrowserStore.getState().start('http://localhost:3000');
    expect(useBrowserStore.getState().detectedPorts).toEqual([]);
  });
});
