import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageReceiver } from '../../src/image/ImageReceiver.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/vp-abc123'),
  writeFile: vi.fn(),
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'),
}));

describe('ImageReceiver', () => {
  let receiver: ImageReceiver;
  let mockFs: any;

  beforeEach(async () => {
    mockFs = await import('fs/promises');
    vi.clearAllMocks();
    receiver = new ImageReceiver();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes and creates temp directory with mkdtemp', async () => {
    await receiver.init();

    expect(mockFs.mkdtemp).toHaveBeenCalledWith(expect.stringMatching(/vp-$/));
  });

  it('starts transfer tracking', async () => {
    await receiver.init();

    expect(() => {
      receiver.startTransfer('transfer-1', 'test.png', 1024);
    }).not.toThrow();
  });

  it('receives chunks and assembles them', async () => {
    await receiver.init();
    receiver.startTransfer('transfer-1', 'test.png', 100);

    // Add chunks out of order to test assembly
    receiver.addChunk('transfer-1', 1, 'Y2h1bms='); // "chunk2" in base64
    receiver.addChunk('transfer-1', 0, 'Y2h1bms='); // "chunk1" in base64

    expect(() => receiver.addChunk('transfer-1', 2, 'ZGF0YQ==')).not.toThrow();
  });

  it('saves completed file with secure permissions and returns correct path', async () => {
    await receiver.init();
    receiver.startTransfer('transfer-1', 'image.png', 50);

    // Add base64 chunk (simulating PNG header)
    receiver.addChunk('transfer-1', 0, 'iVBORw0KGgo=');

    const filePath = await receiver.complete('transfer-1');

    expect(mockFs.writeFile).toHaveBeenCalled();
    expect(filePath).toContain('.png');

    // Verify the writeFile was called with secure mode
    const writeFileCall = (mockFs.writeFile as any).mock.calls[0];
    expect(writeFileCall[0]).toContain('.png');
    expect(writeFileCall[1]).toBeInstanceOf(Buffer);
    expect(writeFileCall[2]).toEqual({ mode: 0o600 });
  });

  it('throws error when completing non-existent transfer', async () => {
    await receiver.init();

    await expect(receiver.complete('non-existent')).rejects.toThrow(
      'Transfer not found: non-existent'
    );
  });

  it('throws error when adding chunk to non-existent transfer', async () => {
    await receiver.init();

    expect(() => {
      receiver.addChunk('non-existent', 0, 'data');
    }).toThrow('Transfer not found: non-existent');
  });

  it('handles multiple concurrent transfers', async () => {
    await receiver.init();

    receiver.startTransfer('transfer-1', 'image1.png', 100);
    receiver.startTransfer('transfer-2', 'image2.jpg', 200);

    receiver.addChunk('transfer-1', 0, 'ZGF0YTE=');
    receiver.addChunk('transfer-2', 0, 'ZGF0YTI=');

    const path1 = await receiver.complete('transfer-1');
    const path2 = await receiver.complete('transfer-2');

    expect(path1).toContain('.png');
    expect(path2).toContain('.jpg');
  });

  it('preserves file extension', async () => {
    await receiver.init();
    receiver.startTransfer('transfer-1', 'screenshot.jpg', 50);
    receiver.addChunk('transfer-1', 0, 'ZGF0YQ==');

    const filePath = await receiver.complete('transfer-1');

    expect(filePath).toMatch(/\.jpg$/);
  });

  it('handles files without extension', async () => {
    await receiver.init();
    receiver.startTransfer('transfer-1', 'imagefile', 50);
    receiver.addChunk('transfer-1', 0, 'ZGF0YQ==');

    const filePath = await receiver.complete('transfer-1');

    // UUID-based filename without extension
    expect(filePath).toMatch(/\/[0-9a-f-]+$/);
  });
});
