import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

interface TransferState {
  filename: string;
  totalSize: number;
  chunks: Map<number, string>;
}

export class ImageReceiver {
  private transfers = new Map<string, TransferState>();
  private tempDir = '/tmp/vp';

  async init(): Promise<void> {
    await mkdir(this.tempDir, { recursive: true });
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

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const nameWithoutExt = transfer.filename.replace(/\.[^.]+$/, '');
    const ext = transfer.filename.includes('.')
      ? transfer.filename.substring(transfer.filename.lastIndexOf('.'))
      : '';
    const uniqueFilename = `${nameWithoutExt}-${timestamp}${ext}`;
    const filePath = join(this.tempDir, uniqueFilename);

    await writeFile(filePath, buffer);

    // Cleanup transfer state
    this.transfers.delete(transferId);

    return filePath;
  }
}
