import { mkdtemp, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

interface TransferState {
  filename: string;
  totalSize: number;
  chunks: Map<number, string>;
}

export class ImageReceiver {
  private transfers = new Map<string, TransferState>();
  private tempDir: string | null = null;

  async init(): Promise<void> {
    this.tempDir = await mkdtemp(join(tmpdir(), 'vp-'));
  }

  startTransfer(transferId: string, filename: string, totalSize: number): void {
    this.transfers.set(transferId, {
      filename,
      totalSize,
      chunks: new Map(),
    });
  }

  addChunk(transferId: string, chunkIndex: number, data: string): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    transfer.chunks.set(chunkIndex, data);
  }

  async complete(transferId: string): Promise<string> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    // Assemble chunks in order
    const sortedChunks = Array.from(transfer.chunks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, data]) => data);

    const base64Data = sortedChunks.join('');
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename with cryptographic randomness
    const ext = transfer.filename.includes('.')
      ? transfer.filename.substring(transfer.filename.lastIndexOf('.'))
      : '';
    const uniqueFilename = `${randomUUID()}${ext}`;
    const filePath = join(this.tempDir!, uniqueFilename);

    await writeFile(filePath, buffer, { mode: 0o600 });

    // Cleanup transfer state
    this.transfers.delete(transferId);

    return filePath;
  }
}
