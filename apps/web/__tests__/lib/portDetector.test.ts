import { describe, it, expect } from 'vitest';
import { detectPorts } from '@/lib/portDetector';

describe('portDetector', () => {
  it('detects http://localhost:3000', () => {
    const ports = detectPorts('Local: http://localhost:3000');
    expect(ports).toEqual(['http://localhost:3000']);
  });

  it('detects https://localhost:3000', () => {
    const ports = detectPorts('  https://localhost:3000/');
    expect(ports).toEqual(['https://localhost:3000']);
  });

  it('detects and normalizes 127.0.0.1', () => {
    const ports = detectPorts('Server on http://127.0.0.1:8080');
    expect(ports).toEqual(['http://localhost:8080']);
  });

  it('detects and normalizes 0.0.0.0', () => {
    const ports = detectPorts('Listening on http://0.0.0.0:5173');
    expect(ports).toEqual(['http://localhost:5173']);
  });

  it('multiple ports in one line', () => {
    const ports = detectPorts('http://localhost:3000 and http://localhost:4000');
    expect(ports).toEqual(['http://localhost:3000', 'http://localhost:4000']);
  });

  it('empty array when no ports', () => {
    const ports = detectPorts('No URLs here');
    expect(ports).toEqual([]);
  });

  it('deduplicates', () => {
    const ports = detectPorts('http://localhost:3000 http://localhost:3000');
    expect(ports).toEqual(['http://localhost:3000']);
  });

  it('strips trailing slash', () => {
    const ports = detectPorts('http://localhost:3000/');
    expect(ports).toEqual(['http://localhost:3000']);
  });

  it('handles ANSI escape codes', () => {
    const ports = detectPorts('\x1b[32mhttp://localhost:3000\x1b[0m');
    expect(ports).toEqual(['http://localhost:3000']);
  });
});
