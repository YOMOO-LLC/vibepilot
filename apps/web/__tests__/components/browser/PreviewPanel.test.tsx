import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewPanel } from '@/components/browser/PreviewPanel';
import { useBrowserStore } from '@/stores/browserStore';

vi.mock('@/lib/transport', () => {
  const handlers = new Map<string, Set<(msg: any) => void>>();
  return {
    transportManager: {
      send: vi.fn(),
      on: (type: string, handler: (msg: any) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(handler);
        return () => handlers.get(type)?.delete(handler);
      },
    },
  };
});

describe('PreviewPanel', () => {
  beforeEach(() => {
    useBrowserStore.setState({
      state: 'idle',
      currentUrl: '',
      pageTitle: '',
      viewportWidth: 1280,
      viewportHeight: 720,
      error: null,
      remoteCursor: 'default',
      latestFrame: null,
    });
    vi.clearAllMocks();
  });

  it('shows placeholder when idle', () => {
    render(<PreviewPanel />);
    expect(screen.getByText('Open Browser Preview')).toBeTruthy();
  });

  it('shows loading when starting', () => {
    useBrowserStore.setState({ state: 'starting' });
    render(<PreviewPanel />);
    expect(screen.getByText(/starting/i)).toBeTruthy();
  });

  it('shows error message on error state', () => {
    useBrowserStore.setState({ state: 'error', error: 'Chrome not found' });
    render(<PreviewPanel />);
    expect(screen.getByText(/Chrome not found/)).toBeTruthy();
  });

  it('renders canvas when running', () => {
    useBrowserStore.setState({ state: 'running' });
    render(<PreviewPanel />);
    expect(screen.getByTestId('preview-canvas')).toBeTruthy();
  });

  it('sends mouse events on canvas mousedown', () => {
    const sendInput = vi.fn();
    useBrowserStore.setState({ state: 'running', sendInput });

    render(<PreviewPanel />);
    const canvas = screen.getByTestId('preview-canvas');

    fireEvent.mouseDown(canvas);
    expect(sendInput).toHaveBeenCalled();
  });

  it('canvas has correct cursor when remoteCursor is pointer', () => {
    useBrowserStore.setState({ state: 'running', remoteCursor: 'pointer' });
    render(<PreviewPanel />);
    const canvas = screen.getByTestId('preview-canvas');
    expect(canvas.style.cursor).toBe('pointer');
  });

  it('cursor updates when remoteCursor changes', () => {
    useBrowserStore.setState({ state: 'running', remoteCursor: 'default' });
    const { rerender } = render(<PreviewPanel />);
    const canvas = screen.getByTestId('preview-canvas');
    expect(canvas.style.cursor).toBe('default');

    useBrowserStore.setState({ remoteCursor: 'text' });
    rerender(<PreviewPanel />);
    expect(canvas.style.cursor).toBe('text');
  });
});
