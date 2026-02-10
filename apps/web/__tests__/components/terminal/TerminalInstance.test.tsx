import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// Mock xterm - note: must use vi.fn() inside factory, no external refs
vi.mock('@xterm/xterm', () => {
  const mockTerminal = {
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    cols: 80,
    rows: 24,
  };
  return {
    Terminal: vi.fn(() => mockTerminal),
    __mockTerminal: mockTerminal,
  };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({
    fit: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(),
}));

vi.mock('@/lib/transport', () => ({
  transportManager: {
    send: vi.fn(),
    on: vi.fn(() => vi.fn()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    activeTransport: 'websocket',
  },
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame to run callback synchronously
global.requestAnimationFrame = vi.fn((cb) => {
  cb(0);
  return 0;
});

// jsdom returns 0 for offsetWidth/offsetHeight — mock non-zero so terminal opens
Object.defineProperty(HTMLDivElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 800,
});
Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 600,
});

import { TerminalInstance } from '@/components/terminal/TerminalInstance';
import { transportManager } from '@/lib/transport';

// Get mock terminal through the module
async function getMockTerminal() {
  const mod = (await import('@xterm/xterm')) as any;
  return mod.__mockTerminal;
}

describe('TerminalInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders terminal container', () => {
    const { getByTestId } = render(<TerminalInstance sessionId="test-session" />);

    expect(getByTestId('terminal-container')).toBeDefined();
  });

  it('initializes xterm on mount', async () => {
    render(<TerminalInstance sessionId="test-session" />);
    const mockTerminal = await getMockTerminal();

    expect(mockTerminal.open).toHaveBeenCalled();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(2);
  });

  it('sends terminal:create on mount', () => {
    render(<TerminalInstance sessionId="test-session" />);

    expect(transportManager.send).toHaveBeenCalledWith(
      'terminal:create',
      expect.objectContaining({
        sessionId: 'test-session',
        cols: 80,
        rows: 24,
      })
    );
  });

  it('registers onData handler for terminal input', async () => {
    render(<TerminalInstance sessionId="test-session" />);
    const mockTerminal = await getMockTerminal();

    expect(mockTerminal.onData).toHaveBeenCalled();
  });

  it('listens for terminal:output messages', () => {
    render(<TerminalInstance sessionId="test-session" />);

    expect(transportManager.on).toHaveBeenCalledWith('terminal:output', expect.any(Function));
  });
});
