const WINDOW_SIZE = 5;
const HIGH_LATENCY_MS = 200;
const LOW_LATENCY_MS = 80;
const STEP_DOWN = 10;
const STEP_UP = 5;
const MIN_QUALITY = 20;
const MAX_QUALITY = 80;

export class AdaptiveQuality {
  private _quality: number;
  private latencies: number[] = [];
  private changed = false;

  constructor(initialQuality = 70) {
    this._quality = initialQuality;
  }

  get quality(): number {
    return this._quality;
  }

  /**
   * Record a frame→ack round-trip latency in ms.
   * When the sliding window is full, adjusts quality accordingly.
   */
  recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > WINDOW_SIZE) {
      this.latencies.shift();
    }

    if (this.latencies.length < WINDOW_SIZE) return;

    const avg = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    const prev = this._quality;

    if (avg > HIGH_LATENCY_MS) {
      this._quality = Math.max(MIN_QUALITY, this._quality - STEP_DOWN);
    } else if (avg < LOW_LATENCY_MS) {
      this._quality = Math.min(MAX_QUALITY, this._quality + STEP_UP);
    }

    if (this._quality !== prev) {
      this.changed = true;
    }
  }

  /**
   * Returns true if quality changed since last call. Resets the flag.
   */
  shouldRestart(): boolean {
    const result = this.changed;
    this.changed = false;
    return result;
  }
}
