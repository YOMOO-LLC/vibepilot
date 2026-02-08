import { describe, it, expect } from 'vitest';
import { CircularBuffer } from '../../src/pty/CircularBuffer.js';

describe('CircularBuffer', () => {
  it('stores and drains data', () => {
    const buf = new CircularBuffer();
    buf.write('hello');
    buf.write(' world');

    expect(buf.size).toBe(11);
    expect(buf.empty).toBe(false);
    expect(buf.drain()).toBe('hello world');
    expect(buf.size).toBe(0);
    expect(buf.empty).toBe(true);
  });

  it('drain on empty buffer returns empty string', () => {
    const buf = new CircularBuffer();
    expect(buf.drain()).toBe('');
    expect(buf.empty).toBe(true);
  });

  it('evicts oldest data when capacity exceeded', () => {
    const buf = new CircularBuffer(10);
    buf.write('12345'); // 5 bytes
    buf.write('67890'); // 5 bytes, total 10 — exactly at capacity
    expect(buf.drain()).toBe('1234567890');

    buf.write('12345'); // 5
    buf.write('67890'); // 5, total 10
    buf.write('ABCDE'); // 5, total 15 — evicts '12345'
    expect(buf.drain()).toBe('67890ABCDE');
  });

  it('truncates single chunk that exceeds capacity', () => {
    const buf = new CircularBuffer(5);
    buf.write('1234567890'); // 10 bytes, capacity 5
    const result = buf.drain();
    expect(result).toBe('67890');
    expect(result.length).toBe(5);
  });

  it('handles many small writes', () => {
    const buf = new CircularBuffer(10);
    for (let i = 0; i < 20; i++) {
      buf.write(String(i % 10));
    }
    const result = buf.drain();
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('size reflects current buffered content', () => {
    const buf = new CircularBuffer(100);
    expect(buf.size).toBe(0);
    buf.write('abc');
    expect(buf.size).toBe(3);
    buf.write('de');
    expect(buf.size).toBe(5);
    buf.drain();
    expect(buf.size).toBe(0);
  });
});
