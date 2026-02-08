import { CircularBuffer } from './CircularBuffer.js';

export type OutputSink = (data: string) => void;

export class OutputDelegate {
  private sink: OutputSink | null = null;
  private buffer: CircularBuffer;

  constructor(bufferCapacity?: number) {
    this.buffer = new CircularBuffer(bufferCapacity);
  }

  /** Permanent handler to be registered once with process.onData */
  readonly handler = (data: string): void => {
    if (this.sink) {
      this.sink(data);
    } else {
      this.buffer.write(data);
    }
  };

  /** Attach a new sink, returns buffered output and clears buffer */
  attach(sink: OutputSink): string {
    const buffered = this.buffer.drain();
    this.sink = sink;
    return buffered;
  }

  /** Detach current sink, subsequent output goes to buffer */
  detach(): void {
    this.sink = null;
  }

  get hasSink(): boolean {
    return this.sink !== null;
  }

  get bufferSize(): number {
    return this.buffer.size;
  }
}
