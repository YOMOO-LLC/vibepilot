import { describe, it, expect } from 'vitest';
import {
  createMessage,
  parseMessage,
  MessageType,
  type VPMessage,
} from '../src/index.js';

describe('createMessage', () => {
  it('creates a message with correct type and payload', () => {
    const msg = createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });

    expect(msg.type).toBe('terminal:create');
    expect(msg.payload.sessionId).toBe('sess-1');
    expect(msg.payload.cols).toBe(80);
    expect(msg.payload.rows).toBe(24);
  });

  it('generates unique message ids', () => {
    const msg1 = createMessage(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'ls',
    });
    const msg2 = createMessage(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'pwd',
    });

    expect(msg1.id).not.toBe(msg2.id);
  });

  it('includes a timestamp', () => {
    const before = Date.now();
    const msg = createMessage(MessageType.TERMINAL_OUTPUT, {
      sessionId: 'sess-1',
      data: 'output',
    });
    const after = Date.now();

    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it('creates terminal:resize message', () => {
    const msg = createMessage(MessageType.TERMINAL_RESIZE, {
      sessionId: 'sess-1',
      cols: 120,
      rows: 40,
    });

    expect(msg.type).toBe('terminal:resize');
    expect(msg.payload.cols).toBe(120);
    expect(msg.payload.rows).toBe(40);
  });

  it('creates filetree:list message', () => {
    const msg = createMessage(MessageType.FILETREE_LIST, {
      path: '/home/user/project',
      depth: 2,
    });

    expect(msg.type).toBe('filetree:list');
    expect(msg.payload.path).toBe('/home/user/project');
    expect(msg.payload.depth).toBe(2);
  });

  it('creates image:start message', () => {
    const msg = createMessage(MessageType.IMAGE_START, {
      transferId: 'transfer-1',
      sessionId: 'sess-1',
      filename: 'screenshot.png',
      totalSize: 1024,
      mimeType: 'image/png',
    });

    expect(msg.type).toBe('image:start');
    expect(msg.payload.filename).toBe('screenshot.png');
    expect(msg.payload.totalSize).toBe(1024);
  });
});

describe('parseMessage', () => {
  it('parses a valid JSON message', () => {
    const raw = JSON.stringify({
      type: 'terminal:output',
      id: 'msg-1',
      timestamp: Date.now(),
      payload: { sessionId: 'sess-1', data: 'hello' },
    });

    const msg = parseMessage(raw);
    expect(msg.type).toBe('terminal:output');
    expect(msg.payload).toEqual({ sessionId: 'sess-1', data: 'hello' });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMessage('not json')).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => parseMessage(JSON.stringify({ type: 'foo' }))).toThrow(
      'Invalid VPMessage format'
    );
    expect(() =>
      parseMessage(JSON.stringify({ type: 'foo', id: '1' }))
    ).toThrow('Invalid VPMessage format');
  });

  it('round-trips with createMessage', () => {
    const original = createMessage(MessageType.TERMINAL_DESTROY, {
      sessionId: 'sess-1',
    });
    const serialized = JSON.stringify(original);
    const parsed = parseMessage(serialized);

    expect(parsed.type).toBe(original.type);
    expect(parsed.id).toBe(original.id);
    expect(parsed.timestamp).toBe(original.timestamp);
    expect(parsed.payload).toEqual(original.payload);
  });
});

describe('MessageType constants', () => {
  it('has all terminal types', () => {
    expect(MessageType.TERMINAL_CREATE).toBe('terminal:create');
    expect(MessageType.TERMINAL_CREATED).toBe('terminal:created');
    expect(MessageType.TERMINAL_INPUT).toBe('terminal:input');
    expect(MessageType.TERMINAL_OUTPUT).toBe('terminal:output');
    expect(MessageType.TERMINAL_RESIZE).toBe('terminal:resize');
    expect(MessageType.TERMINAL_DESTROY).toBe('terminal:destroy');
    expect(MessageType.TERMINAL_DESTROYED).toBe('terminal:destroyed');
    expect(MessageType.TERMINAL_ATTACH).toBe('terminal:attach');
    expect(MessageType.TERMINAL_ATTACHED).toBe('terminal:attached');
  });

  it('has all filetree types', () => {
    expect(MessageType.FILETREE_LIST).toBe('filetree:list');
    expect(MessageType.FILETREE_DATA).toBe('filetree:data');
    expect(MessageType.FILETREE_CHANGED).toBe('filetree:changed');
  });

  it('has all image types', () => {
    expect(MessageType.IMAGE_START).toBe('image:start');
    expect(MessageType.IMAGE_CHUNK).toBe('image:chunk');
    expect(MessageType.IMAGE_COMPLETE).toBe('image:complete');
    expect(MessageType.IMAGE_SAVED).toBe('image:saved');
  });

  it('has all signal types', () => {
    expect(MessageType.SIGNAL_OFFER).toBe('signal:offer');
    expect(MessageType.SIGNAL_ANSWER).toBe('signal:answer');
    expect(MessageType.SIGNAL_CANDIDATE).toBe('signal:candidate');
  });

  it('has all project types', () => {
    expect(MessageType.PROJECT_SWITCH).toBe('project:switch');
    expect(MessageType.PROJECT_SWITCHED).toBe('project:switched');
    expect(MessageType.PROJECT_LIST).toBe('project:list');
    expect(MessageType.PROJECT_LIST_DATA).toBe('project:list-data');
  });

  it('has all file content types', () => {
    expect(MessageType.FILE_READ).toBe('file:read');
    expect(MessageType.FILE_DATA).toBe('file:data');
    expect(MessageType.FILE_WRITE).toBe('file:write');
    expect(MessageType.FILE_WRITTEN).toBe('file:written');
    expect(MessageType.FILE_ERROR).toBe('file:error');
  });
});

describe('terminal attach messages', () => {
  it('creates terminal:attach message', () => {
    const msg = createMessage(MessageType.TERMINAL_ATTACH, {
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });

    expect(msg.type).toBe('terminal:attach');
    expect(msg.payload.sessionId).toBe('sess-1');
    expect(msg.payload.cols).toBe(80);
    expect(msg.payload.rows).toBe(24);
  });

  it('creates terminal:attached message', () => {
    const msg = createMessage(MessageType.TERMINAL_ATTACHED, {
      sessionId: 'sess-1',
      pid: 12345,
      bufferedOutput: 'hello world',
    });

    expect(msg.type).toBe('terminal:attached');
    expect(msg.payload.sessionId).toBe('sess-1');
    expect(msg.payload.pid).toBe(12345);
    expect(msg.payload.bufferedOutput).toBe('hello world');
  });

  it('round-trips terminal:attached message', () => {
    const original = createMessage(MessageType.TERMINAL_ATTACHED, {
      sessionId: 'sess-1',
      pid: 12345,
      bufferedOutput: 'buffered data',
    });
    const serialized = JSON.stringify(original);
    const parsed = parseMessage(serialized);

    expect(parsed.type).toBe(original.type);
    expect(parsed.payload).toEqual(original.payload);
  });
});

describe('file content messages', () => {
  it('creates file:read message', () => {
    const msg = createMessage(MessageType.FILE_READ, {
      filePath: '/home/user/project/src/index.ts',
    });

    expect(msg.type).toBe('file:read');
    expect(msg.payload.filePath).toBe('/home/user/project/src/index.ts');
  });

  it('creates file:data message', () => {
    const msg = createMessage(MessageType.FILE_DATA, {
      filePath: '/home/user/project/src/index.ts',
      content: 'console.log("hello")',
      encoding: 'utf-8',
      language: 'typescript',
      mimeType: 'text/plain',
      size: 21,
      readonly: false,
    });

    expect(msg.type).toBe('file:data');
    expect(msg.payload.content).toBe('console.log("hello")');
    expect(msg.payload.encoding).toBe('utf-8');
    expect(msg.payload.language).toBe('typescript');
    expect(msg.payload.readonly).toBe(false);
  });

  it('creates file:write message', () => {
    const msg = createMessage(MessageType.FILE_WRITE, {
      filePath: '/home/user/project/src/index.ts',
      content: 'console.log("updated")',
      encoding: 'utf-8',
    });

    expect(msg.type).toBe('file:write');
    expect(msg.payload.content).toBe('console.log("updated")');
    expect(msg.payload.encoding).toBe('utf-8');
  });

  it('creates file:written message', () => {
    const msg = createMessage(MessageType.FILE_WRITTEN, {
      filePath: '/home/user/project/src/index.ts',
      size: 23,
    });

    expect(msg.type).toBe('file:written');
    expect(msg.payload.size).toBe(23);
  });

  it('creates file:error message', () => {
    const msg = createMessage(MessageType.FILE_ERROR, {
      filePath: '/nonexistent/file.ts',
      error: 'ENOENT: no such file or directory',
    });

    expect(msg.type).toBe('file:error');
    expect(msg.payload.error).toBe('ENOENT: no such file or directory');
  });

  it('round-trips file:data message', () => {
    const original = createMessage(MessageType.FILE_DATA, {
      filePath: '/test/file.py',
      content: 'print("hello")',
      encoding: 'utf-8',
      language: 'python',
      mimeType: 'text/plain',
      size: 15,
      readonly: false,
    });
    const serialized = JSON.stringify(original);
    const parsed = parseMessage(serialized);

    expect(parsed.type).toBe(original.type);
    expect(parsed.payload).toEqual(original.payload);
  });
});
