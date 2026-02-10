import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewToolbar } from '@/components/browser/PreviewToolbar';
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

describe('PreviewToolbar', () => {
  beforeEach(() => {
    useBrowserStore.setState({
      state: 'running',
      currentUrl: 'http://localhost:3000',
      pageTitle: 'My App',
      viewportWidth: 1280,
      viewportHeight: 720,
      error: null,
      remoteCursor: 'default',
      latestFrame: null,
    });
    vi.clearAllMocks();
  });

  it('renders address bar with current URL', () => {
    render(<PreviewToolbar />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('http://localhost:3000');
  });

  it('navigates on Enter key', () => {
    const navigate = vi.fn();
    useBrowserStore.setState({ navigate });

    render(<PreviewToolbar />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'http://localhost:3000/about' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(navigate).toHaveBeenCalledWith('http://localhost:3000/about');
  });

  it('calls stop on close button click', () => {
    const stop = vi.fn();
    useBrowserStore.setState({ stop });

    render(<PreviewToolbar />);
    const closeBtn = screen.getByLabelText('Close browser');
    fireEvent.click(closeBtn);

    expect(stop).toHaveBeenCalled();
  });
});
