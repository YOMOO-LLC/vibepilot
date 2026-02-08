import { describe, it, expect, vi } from 'vitest';
import { OutputDelegate } from '../../src/pty/OutputDelegate.js';

describe('OutputDelegate', () => {
  it('forwards data to sink when attached', () => {
    const delegate = new OutputDelegate();
    const sink = vi.fn();
    delegate.attach(sink);

    delegate.handler('hello');
    expect(sink).toHaveBeenCalledWith('hello');
  });

  it('buffers data when no sink attached', () => {
    const delegate = new OutputDelegate();
    delegate.handler('buffered');
    expect(delegate.bufferSize).toBe(8);
  });

  it('attach returns buffered data and clears buffer', () => {
    const delegate = new OutputDelegate();
    delegate.handler('line1');
    delegate.handler('line2');

    const sink = vi.fn();
    const buffered = delegate.attach(sink);

    expect(buffered).toBe('line1line2');
    expect(delegate.bufferSize).toBe(0);
  });

  it('detach switches to buffering mode', () => {
    const delegate = new OutputDelegate();
    const sink = vi.fn();
    delegate.attach(sink);

    delegate.handler('forwarded');
    expect(sink).toHaveBeenCalledWith('forwarded');

    delegate.detach();
    delegate.handler('buffered');
    expect(sink).toHaveBeenCalledTimes(1); // not called again

    const sink2 = vi.fn();
    const buffered = delegate.attach(sink2);
    expect(buffered).toBe('buffered');
  });

  it('hasSink reflects current state', () => {
    const delegate = new OutputDelegate();
    expect(delegate.hasSink).toBe(false);

    delegate.attach(vi.fn());
    expect(delegate.hasSink).toBe(true);

    delegate.detach();
    expect(delegate.hasSink).toBe(false);
  });

  it('handler is a stable reference', () => {
    const delegate = new OutputDelegate();
    const ref1 = delegate.handler;
    const ref2 = delegate.handler;
    expect(ref1).toBe(ref2);
  });

  it('respects buffer capacity', () => {
    const delegate = new OutputDelegate(10);
    delegate.handler('12345');
    delegate.handler('67890');
    delegate.handler('ABCDE'); // exceeds 10, evicts oldest

    const sink = vi.fn();
    const buffered = delegate.attach(sink);
    expect(buffered).toBe('67890ABCDE');
  });
});
