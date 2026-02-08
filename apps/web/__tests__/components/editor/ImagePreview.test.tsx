import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImagePreview } from '@/components/editor/ImagePreview';

// Mock transport manager (needed by editorStore import chain)
vi.mock('@/lib/transport', () => ({
  transportManager: {
    send: vi.fn(),
    on: () => () => {},
  },
}));

describe('ImagePreview', () => {
  it('renders image with correct data URI', () => {
    const tab = {
      id: 'editor-1',
      filePath: '/project/logo.png',
      fileName: 'logo.png',
      content: 'iVBORw0KGgo=',
      originalContent: 'iVBORw0KGgo=',
      language: '',
      mimeType: 'image/png',
      encoding: 'base64' as const,
      size: 100,
      readonly: true,
      loading: false,
      error: null,
    };

    render(<ImagePreview tab={tab} />);

    const container = screen.getByTestId('image-preview');
    expect(container).toBeTruthy();

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(img!.getAttribute('alt')).toBe('logo.png');
  });

  it('renders SVG images', () => {
    const tab = {
      id: 'editor-2',
      filePath: '/project/icon.svg',
      fileName: 'icon.svg',
      content: 'PHN2ZyAvPg==',
      originalContent: 'PHN2ZyAvPg==',
      language: '',
      mimeType: 'image/svg+xml',
      encoding: 'base64' as const,
      size: 50,
      readonly: true,
      loading: false,
      error: null,
    };

    render(<ImagePreview tab={tab} />);

    const img = screen.getByTestId('image-preview').querySelector('img');
    expect(img!.getAttribute('src')).toBe('data:image/svg+xml;base64,PHN2ZyAvPg==');
  });
});
