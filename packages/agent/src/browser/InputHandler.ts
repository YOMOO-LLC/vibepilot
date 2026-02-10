import type { BrowserInputPayload } from '@vibepilot/protocol';

interface CDPInput {
  dispatchMouseEvent(params: Record<string, unknown>): Promise<void>;
  dispatchKeyEvent(params: Record<string, unknown>): Promise<void>;
  insertText(params: { text: string }): Promise<void>;
}

const MOUSE_TYPES = new Set(['mousePressed', 'mouseReleased', 'mouseMoved', 'mouseWheel']);

const KEY_TYPES = new Set(['keyDown', 'keyUp']);

export class InputHandler {
  private cdpInput: CDPInput;
  private viewportWidth = Infinity;
  private viewportHeight = Infinity;

  constructor(cdpInput: CDPInput) {
    this.cdpInput = cdpInput;
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  async handle(input: BrowserInputPayload): Promise<void> {
    if (input.type === 'insertText') {
      await this.cdpInput.insertText({ text: input.text! });
      return;
    }

    if (MOUSE_TYPES.has(input.type)) {
      const x = Math.max(0, Math.min(input.x ?? 0, this.viewportWidth));
      const y = Math.max(0, Math.min(input.y ?? 0, this.viewportHeight));

      const params: Record<string, unknown> = { type: input.type, x, y };
      if (input.button !== undefined) params.button = input.button;
      if (input.clickCount !== undefined) params.clickCount = input.clickCount;
      if (input.deltaX !== undefined) params.deltaX = input.deltaX;
      if (input.deltaY !== undefined) params.deltaY = input.deltaY;

      await this.cdpInput.dispatchMouseEvent(params);
      return;
    }

    if (KEY_TYPES.has(input.type)) {
      await this.cdpInput.dispatchKeyEvent({
        type: input.type,
        key: input.key,
        code: input.code,
        modifiers: input.modifiers ?? 0,
      });
    }
  }
}
