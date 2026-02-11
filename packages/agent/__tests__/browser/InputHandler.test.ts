import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputHandler } from '../../src/browser/InputHandler.js';

describe('InputHandler', () => {
  let mockInput: {
    dispatchMouseEvent: ReturnType<typeof vi.fn>;
    dispatchKeyEvent: ReturnType<typeof vi.fn>;
    insertText: ReturnType<typeof vi.fn>;
  };
  let handler: InputHandler;

  beforeEach(() => {
    mockInput = {
      dispatchMouseEvent: vi.fn().mockResolvedValue(undefined),
      dispatchKeyEvent: vi.fn().mockResolvedValue(undefined),
      insertText: vi.fn().mockResolvedValue(undefined),
    };
    handler = new InputHandler(mockInput as any);
  });

  it('dispatches mousePressed event', async () => {
    await handler.handle({
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });

    expect(mockInput.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });
  });

  it('dispatches mouseWheel event', async () => {
    await handler.handle({
      type: 'mouseWheel',
      x: 50,
      y: 50,
      deltaX: 0,
      deltaY: -120,
    });

    expect(mockInput.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'mouseWheel',
      x: 50,
      y: 50,
      deltaX: 0,
      deltaY: -120,
    });
  });

  it('dispatches keyDown event', async () => {
    await handler.handle({
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 0,
    });

    expect(mockInput.dispatchKeyEvent).toHaveBeenCalledWith({
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 0,
    });
  });

  it('does not add text for special keys like Enter', async () => {
    await handler.handle({
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      modifiers: 0,
    });

    expect(mockInput.dispatchKeyEvent).toHaveBeenCalledWith({
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      modifiers: 0,
    });
  });

  it('dispatches insertText event', async () => {
    await handler.handle({
      type: 'insertText',
      text: 'hello',
    });

    expect(mockInput.insertText).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('clamps coordinates to viewport bounds', async () => {
    handler.setViewport(1280, 720);

    await handler.handle({
      type: 'mousePressed',
      x: -10,
      y: 9999,
      button: 'left',
      clickCount: 1,
    });

    expect(mockInput.dispatchMouseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 0,
        y: 720,
      })
    );
  });
});
