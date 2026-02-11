import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CursorProbe } from '../../src/browser/CursorProbe.js';

describe('CursorProbe', () => {
  let mockRuntime: { evaluate: ReturnType<typeof vi.fn> };
  let probe: CursorProbe;

  beforeEach(() => {
    mockRuntime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: 'pointer' } }),
    };
    probe = new CursorProbe(mockRuntime);
  });

  it('returns cursor from Runtime.evaluate', async () => {
    const cursor = await probe.probe(100, 200);
    expect(cursor).toBe('pointer');
  });

  it('passes correct coordinates in JS expression', async () => {
    await probe.probe(42, 99);

    const expression = mockRuntime.evaluate.mock.calls[0][0].expression;
    expect(expression).toContain('42');
    expect(expression).toContain('99');
  });

  it('returns null when cursor unchanged (dedup)', async () => {
    // First call returns 'pointer'
    const first = await probe.probe(10, 20);
    expect(first).toBe('pointer');

    // Second call returns same value → null (deduped)
    const second = await probe.probe(10, 20);
    expect(second).toBeNull();
  });

  it('returns new value when cursor changes', async () => {
    await probe.probe(10, 20); // 'pointer'

    mockRuntime.evaluate.mockResolvedValue({ result: { value: 'text' } });
    const cursor = await probe.probe(10, 20);
    expect(cursor).toBe('text');
  });

  it("defaults to 'default' on undefined result", async () => {
    mockRuntime.evaluate.mockResolvedValue({ result: {} });
    const cursor = await probe.probe(10, 20);
    expect(cursor).toBe('default');
  });

  it("defaults to 'default' on evaluate error", async () => {
    mockRuntime.evaluate.mockRejectedValue(new Error('Page crashed'));
    const cursor = await probe.probe(10, 20);
    expect(cursor).toBe('default');
  });
});
