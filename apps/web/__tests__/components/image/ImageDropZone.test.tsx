import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ImageDropZone } from '@/components/image/ImageDropZone';

// Mock transport manager
vi.mock('@/lib/transport', () => ({
  transportManager: {
    send: vi.fn(),
    on: vi.fn(() => vi.fn()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    activeTransport: 'websocket',
  },
}));

// Mock terminal store
vi.mock('@/stores/terminalStore', () => ({
  useTerminalStore: Object.assign(
    vi.fn(() => ({ tabs: [], activeTabId: null })),
    {
      getState: vi.fn(() => ({
        tabs: [{ id: 'tab-1', sessionId: 'session-1' }],
        activeTabId: 'tab-1',
      })),
    }
  ),
}));

describe('ImageDropZone', () => {
  let mockTransport: any;

  beforeEach(async () => {
    const transport = await import('@/lib/transport');
    mockTransport = transport.transportManager;
    vi.clearAllMocks();
    // Re-setup on mock since clearAllMocks resets it
    (mockTransport.on as any).mockReturnValue(vi.fn());
  });

  it('renders drop zone overlay on drag', () => {
    const { container, getByText } = render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    const dropZone = container.firstChild as HTMLElement;

    // Trigger dragenter
    fireEvent.dragEnter(dropZone, {
      dataTransfer: {
        types: ['Files'],
      },
    });

    expect(getByText(/drop file/i)).toBeDefined();
  });

  it('handles drop event', async () => {
    const { container } = render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    const dropZone = container.firstChild as HTMLElement;

    // Create a mock file
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    // Trigger drop
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    // Wait for async processing
    await waitFor(() => {
      expect(mockTransport.send).toHaveBeenCalledWith(
        'image:start',
        expect.objectContaining({
          filename: 'test.png',
          mimeType: 'image/png',
          sessionId: 'session-1',
        })
      );
    });
  });

  it('handles paste event', async () => {
    render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    // Create a mock clipboard with image data (default browser name triggers rename)
    const file = new File(['test'], 'image.png', { type: 'image/png' });

    // Create paste event manually
    const pasteEvent = new Event('paste', { bubbles: true });

    // Mock clipboardData
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
      writable: false,
    });

    fireEvent(document, pasteEvent);

    // Wait for async processing — file named "image.png" gets renamed to "pasted-{timestamp}.png"
    await waitFor(() => {
      expect(mockTransport.send).toHaveBeenCalledWith(
        'image:start',
        expect.objectContaining({
          filename: expect.stringContaining('pasted-'),
          mimeType: 'image/png',
        })
      );
    });
  });

  it('sends image chunks for large files', async () => {
    const { container } = render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    const dropZone = container.firstChild as HTMLElement;

    // Create a larger mock file (100KB)
    const size = 100 * 1024;
    const content = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      content[i] = i % 256;
    }
    const file = new File([content], 'large.png', { type: 'image/png' });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    // Wait for async processing
    await waitFor(() => {
      // Should send start, chunks, and complete
      const calls = (mockTransport.send as any).mock.calls;
      const startCall = calls.find((c: any) => c[0] === 'image:start');
      const chunkCalls = calls.filter((c: any) => c[0] === 'image:chunk');
      const completeCall = calls.find((c: any) => c[0] === 'image:complete');

      expect(startCall).toBeDefined();
      expect(chunkCalls.length).toBeGreaterThan(0);
      expect(completeCall).toBeDefined();
    });
  });

  it('rejects unsupported file types', async () => {
    const { container } = render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    const dropZone = container.firstChild as HTMLElement;

    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockTransport.send).not.toHaveBeenCalled();
  });

  it('accepts PDF files', async () => {
    const { container } = render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    const dropZone = container.firstChild as HTMLElement;

    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(mockTransport.send).toHaveBeenCalledWith(
        'image:start',
        expect.objectContaining({
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
        })
      );
    });
  });

  it('hides overlay on dragleave', () => {
    const { container, queryByText } = render(
      <ImageDropZone>
        <div>Test Content</div>
      </ImageDropZone>
    );

    const dropZone = container.firstChild as HTMLElement;

    // Show overlay
    fireEvent.dragEnter(dropZone, {
      dataTransfer: {
        types: ['Files'],
      },
    });

    expect(queryByText(/drop file/i)).toBeDefined();

    // Hide overlay
    fireEvent.dragLeave(dropZone, {
      dataTransfer: {
        types: ['Files'],
      },
    });

    expect(queryByText(/drop file/i)).toBeNull();
  });
});
