export class CircularBuffer {
  private chunks: string[] = [];
  private totalSize = 0;
  private capacity: number;

  constructor(capacity = 100 * 1024) {
    this.capacity = capacity;
  }

  write(data: string): void {
    this.chunks.push(data);
    this.totalSize += data.length;

    // Evict oldest chunks until within capacity
    while (this.totalSize > this.capacity && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.totalSize -= removed.length;
    }

    // If a single chunk exceeds capacity, truncate from the start
    if (this.totalSize > this.capacity && this.chunks.length === 1) {
      const chunk = this.chunks[0];
      this.chunks[0] = chunk.slice(chunk.length - this.capacity);
      this.totalSize = this.chunks[0].length;
    }
  }

  drain(): string {
    const result = this.chunks.join('');
    this.chunks = [];
    this.totalSize = 0;
    return result;
  }

  get size(): number {
    return this.totalSize;
  }

  get empty(): boolean {
    return this.totalSize === 0;
  }
}
