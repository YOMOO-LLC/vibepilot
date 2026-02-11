import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { useEditorStore } from '@/stores/editorStore';

// Mock transport manager
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

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <div data-testid="mock-monaco">{value}</div>,
}));

describe('EditorPanel', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      counter: 0,
    });
  });

  it('shows "No file open" when no tab is active', () => {
    render(<EditorPanel />);
    expect(screen.getByText('No file open')).toBeTruthy();
  });

  it('shows loading state', () => {
    useEditorStore.setState({
      tabs: [
        {
          id: 'editor-1',
          filePath: '/project/file.ts',
          fileName: 'file.ts',
          content: '',
          originalContent: '',
          language: 'typescript',
          mimeType: '',
          encoding: 'utf-8',
          size: 0,
          readonly: false,
          loading: true,
          error: null,
        },
      ],
      activeTabId: 'editor-1',
    });

    render(<EditorPanel />);
    expect(screen.getByTestId('editor-loading')).toBeTruthy();
  });

  it('shows error state', () => {
    useEditorStore.setState({
      tabs: [
        {
          id: 'editor-1',
          filePath: '/project/file.ts',
          fileName: 'file.ts',
          content: '',
          originalContent: '',
          language: '',
          mimeType: '',
          encoding: 'utf-8',
          size: 0,
          readonly: false,
          loading: false,
          error: 'File not found',
        },
      ],
      activeTabId: 'editor-1',
    });

    render(<EditorPanel />);
    expect(screen.getByTestId('editor-error')).toBeTruthy();
    expect(screen.getByText(/File not found/)).toBeTruthy();
  });

  it('renders image preview for image files', () => {
    useEditorStore.setState({
      tabs: [
        {
          id: 'editor-1',
          filePath: '/project/logo.png',
          fileName: 'logo.png',
          content: 'base64data',
          originalContent: 'base64data',
          language: '',
          mimeType: 'image/png',
          encoding: 'base64',
          size: 100,
          readonly: true,
          loading: false,
          error: null,
        },
      ],
      activeTabId: 'editor-1',
    });

    render(<EditorPanel />);
    expect(screen.getByTestId('image-preview')).toBeTruthy();
  });

  it('renders Monaco editor for text files', () => {
    useEditorStore.setState({
      tabs: [
        {
          id: 'editor-1',
          filePath: '/project/file.ts',
          fileName: 'file.ts',
          content: 'const x = 1;',
          originalContent: 'const x = 1;',
          language: 'typescript',
          mimeType: 'text/plain',
          encoding: 'utf-8',
          size: 12,
          readonly: false,
          loading: false,
          error: null,
        },
      ],
      activeTabId: 'editor-1',
    });

    render(<EditorPanel />);
    expect(screen.getByTestId('monaco-editor')).toBeTruthy();
  });
});
