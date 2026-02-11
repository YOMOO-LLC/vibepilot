import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveQuality } from '../../src/browser/AdaptiveQuality.js';

describe('AdaptiveQuality', () => {
  let aq: AdaptiveQuality;

  beforeEach(() => {
    aq = new AdaptiveQuality();
  });

  it('starts with initial quality', () => {
    expect(aq.quality).toBe(70);
  });

  it('decreases quality on high latency', () => {
    // Fill window with high-latency samples (> 200ms)
    for (let i = 0; i < 5; i++) {
      aq.recordLatency(300);
    }
    expect(aq.quality).toBe(60); // 70 - 10
  });

  it('increases quality on low latency', () => {
    // Fill window with low-latency samples (< 80ms)
    for (let i = 0; i < 5; i++) {
      aq.recordLatency(50);
    }
    expect(aq.quality).toBe(75); // 70 + 5
  });

  it('does not exceed max', () => {
    // Start at 70, try to push above 80
    for (let i = 0; i < 20; i++) {
      aq.recordLatency(10);
    }
    expect(aq.quality).toBe(80);
  });

  it('does not go below min', () => {
    // Push quality all the way down
    for (let i = 0; i < 50; i++) {
      aq.recordLatency(500);
    }
    expect(aq.quality).toBe(20);
  });

  it('shouldRestart returns true only on quality change', () => {
    // Not enough samples yet — no change
    aq.recordLatency(300);
    expect(aq.shouldRestart()).toBe(false);

    // Fill window to trigger change
    for (let i = 0; i < 4; i++) {
      aq.recordLatency(300);
    }
    expect(aq.shouldRestart()).toBe(true);

    // After acknowledging, should be false again
    expect(aq.shouldRestart()).toBe(false);
  });

  it('keeps quality stable in middle range', () => {
    // Latency between 80 and 200 — no change
    for (let i = 0; i < 10; i++) {
      aq.recordLatency(120);
    }
    expect(aq.quality).toBe(70);
  });
});
