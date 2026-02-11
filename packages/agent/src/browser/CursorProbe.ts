interface CDPRuntime {
  evaluate(params: { expression: string }): Promise<{ result: { value?: string } }>;
}

export class CursorProbe {
  private runtime: CDPRuntime;
  private lastCursor: string | null = null;

  constructor(runtime: CDPRuntime) {
    this.runtime = runtime;
  }

  /**
   * Probe the cursor at (x, y) via CDP Runtime.evaluate.
   * Returns the CSS cursor string if it changed, or null if unchanged (dedup).
   */
  async probe(x: number, y: number): Promise<string | null> {
    // Validate inputs are finite numbers to prevent JS injection
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      return null;
    }

    let cursor: string;
    try {
      const { result } = await this.runtime.evaluate({
        expression: `(function(){var e=document.elementFromPoint(${x},${y});return e?getComputedStyle(e).cursor:'default'})()`,
      });
      cursor = result.value ?? 'default';
    } catch {
      cursor = 'default';
    }

    if (cursor === this.lastCursor) {
      return null;
    }
    this.lastCursor = cursor;
    return cursor;
  }
}
