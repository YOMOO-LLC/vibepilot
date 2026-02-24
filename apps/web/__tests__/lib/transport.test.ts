import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageType } from '@vibepilot/protocol';

// Use vi.hoisted to define mock objects that can be referenced in vi.mock factories
const { mockWsClient, mockWebRTCClient } = vi.hoisted(() => {
  const mockWsClient = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    onAny: vi.fn().mockReturnValue(vi.fn()),
    state: 'disconnected' as string,
  };

  const mockWebRTCClient = {
    createOffer: vi.fn().mockResolvedValue(undefined),
    handleAnswer: vi.fn().mockResolvedValue(undefined),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    close: vi.fn(),
    state: 'disconnected' as string,
  };

  return { mockWsClient, mockWebRTCClient };
});

vi.mock('@/lib/websocket', () => ({
  wsClient: mockWsClient,
  VPWebSocketClient: vi.fn(),
}));

vi.mock('@/lib/webrtc', () => ({
  VPWebRTCClient: vi.fn().mockImplementation(() => mockWebRTCClient),
}));

import { TransportManager } from '@/lib/transport';

describe('TransportManager', () => {
  let manager: TransportManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWsClient.state = 'disconnected';
    mockWebRTCClient.state = 'disconnected';
    mockWsClient.on.mockReturnValue(vi.fn());
    mockWebRTCClient.on.mockReturnValue(vi.fn());
    manager = new TransportManager();
  });

  it('defaults to websocket transport', () => {
    expect(manager.activeTransport).toBe('websocket');
  });

  it('connect establishes websocket connection', () => {
    manager.connect('ws://localhost:9800');
    expect(mockWsClient.connect).toHaveBeenCalledWith('ws://localhost:9800', expect.any(Function));
  });

  it('attempts WebRTC upgrade after WS connects', () => {
    manager.connect('ws://localhost:9800');

    // Simulate WS connected - extract the onStateChange callback
    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    // Should have attempted WebRTC upgrade by calling createOffer
    expect(mockWebRTCClient.createOffer).toHaveBeenCalled();
  });

  it('sends terminal messages via WebRTC when connected', () => {
    manager.connect('ws://localhost:9800');

    // Simulate WS connected
    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    // Simulate WebRTC connected
    mockWebRTCClient.state = 'connected';
    // Trigger the state change through the createOffer's onStateChange callback
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    // Now send a terminal message
    manager.send(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });

    // Should go through WebRTC
    expect(mockWebRTCClient.send).toHaveBeenCalledWith('terminal-io', MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });
    expect(mockWsClient.send).not.toHaveBeenCalled();
  });

  it('falls back to WebSocket for terminal messages when WebRTC not connected', () => {
    manager.connect('ws://localhost:9800');

    // Simulate WS connected
    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';

    // WebRTC stays disconnected
    mockWebRTCClient.state = 'disconnected';

    manager.send(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });

    // Should fall back to WS
    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });
  });

  it('sends image messages via WebRTC file-transfer channel when connected', () => {
    manager.connect('ws://localhost:9800');

    // Simulate WS connected
    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    // Simulate WebRTC connected
    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.IMAGE_CHUNK, {
      transferId: 't-1',
      chunkIndex: 0,
      data: 'base64data',
    });

    expect(mockWebRTCClient.send).toHaveBeenCalledWith('file-transfer', MessageType.IMAGE_CHUNK, {
      transferId: 't-1',
      chunkIndex: 0,
      data: 'base64data',
    });
  });

  it('always sends control messages via WebSocket', () => {
    manager.connect('ws://localhost:9800');

    // Simulate both connected
    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';
    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    // filetree messages should always go through WS
    manager.send(MessageType.FILETREE_LIST, { path: '/' });

    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.FILETREE_LIST, { path: '/' });
    expect(mockWebRTCClient.send).not.toHaveBeenCalled();
  });

  it('always sends signal messages via WebSocket', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';
    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.SIGNAL_OFFER, { sdp: 'test' });

    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.SIGNAL_OFFER, { sdp: 'test' });
    expect(mockWebRTCClient.send).not.toHaveBeenCalled();
  });

  it('always sends project messages via WebSocket', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';
    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.PROJECT_SWITCH, { projectId: 'p-1' });

    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.PROJECT_SWITCH, {
      projectId: 'p-1',
    });
    expect(mockWebRTCClient.send).not.toHaveBeenCalled();
  });

  it('on registers handler on both WS and WebRTC', () => {
    const handler = vi.fn();
    manager.on(MessageType.TERMINAL_OUTPUT, handler);

    expect(mockWsClient.on).toHaveBeenCalledWith(MessageType.TERMINAL_OUTPUT, expect.any(Function));
    expect(mockWebRTCClient.on).toHaveBeenCalledWith(
      MessageType.TERMINAL_OUTPUT,
      expect.any(Function)
    );
  });

  it('on returns unsubscribe function that removes both handlers', () => {
    const wsUnsub = vi.fn();
    const rtcUnsub = vi.fn();
    mockWsClient.on.mockReturnValue(wsUnsub);
    mockWebRTCClient.on.mockReturnValue(rtcUnsub);

    const handler = vi.fn();
    const unsub = manager.on(MessageType.TERMINAL_OUTPUT, handler);
    unsub();

    expect(wsUnsub).toHaveBeenCalled();
    expect(rtcUnsub).toHaveBeenCalled();
  });

  it('disconnect closes both WS and WebRTC', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    manager.disconnect();

    expect(mockWsClient.disconnect).toHaveBeenCalled();
    expect(mockWebRTCClient.close).toHaveBeenCalled();
  });

  it('WebRTC failure falls back to websocket transport gracefully', () => {
    manager.connect('ws://localhost:9800');

    // Simulate WS connected
    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    // Simulate WebRTC failure
    mockWebRTCClient.state = 'failed';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('failed');

    // Active transport should remain websocket
    expect(manager.activeTransport).toBe('websocket');

    // Terminal messages should still work via WS
    mockWsClient.state = 'connected';
    manager.send(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });

    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });
  });

  it('activeTransport becomes webrtc when WebRTC connects', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    // Simulate WebRTC connected
    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    expect(manager.activeTransport).toBe('webrtc');
  });

  it('handles signaling messages from WS for WebRTC setup', () => {
    manager.connect('ws://localhost:9800');

    // WS should listen for signal:answer and signal:candidate
    const onCalls = mockWsClient.on.mock.calls;
    const signalTypes = onCalls.map((call: any) => call[0]);
    expect(signalTypes).toContain(MessageType.SIGNAL_ANSWER);
    expect(signalTypes).toContain(MessageType.SIGNAL_CANDIDATE);
  });

  it('forwards signal:answer to WebRTC client', () => {
    manager.connect('ws://localhost:9800');

    // Find the signal:answer handler registered on wsClient
    const answerCall = mockWsClient.on.mock.calls.find(
      (call: any) => call[0] === MessageType.SIGNAL_ANSWER
    );
    expect(answerCall).toBeTruthy();

    const answerHandler = answerCall[1];
    answerHandler({
      type: MessageType.SIGNAL_ANSWER,
      id: 'msg-1',
      timestamp: Date.now(),
      payload: { sdp: 'remote-answer-sdp' },
    });

    expect(mockWebRTCClient.handleAnswer).toHaveBeenCalledWith('remote-answer-sdp');
  });

  it('forwards signal:candidate to WebRTC client', () => {
    manager.connect('ws://localhost:9800');

    // Find the signal:candidate handler registered on wsClient
    const candidateCall = mockWsClient.on.mock.calls.find(
      (call: any) => call[0] === MessageType.SIGNAL_CANDIDATE
    );
    expect(candidateCall).toBeTruthy();

    const candidateHandler = candidateCall[1];
    candidateHandler({
      type: MessageType.SIGNAL_CANDIDATE,
      id: 'msg-2',
      timestamp: Date.now(),
      payload: { candidate: 'remote-candidate', sdpMid: '0', sdpMLineIndex: 0 },
    });

    expect(mockWebRTCClient.addIceCandidate).toHaveBeenCalledWith('remote-candidate', '0', 0);
  });

  it('routes browser:input to browser-stream channel via WebRTC', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.BROWSER_INPUT, {
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 0,
      modifiers: 0,
    });

    expect(mockWebRTCClient.send).toHaveBeenCalledWith(
      'browser-stream',
      MessageType.BROWSER_INPUT,
      { type: 'mousePressed', x: 100, y: 200, button: 0, modifiers: 0 }
    );
    expect(mockWsClient.send).not.toHaveBeenCalled();
  });

  it('routes browser:frame-ack to browser-stream channel via WebRTC', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.BROWSER_FRAME_ACK, {
      timestamp: 12345,
    });

    expect(mockWebRTCClient.send).toHaveBeenCalledWith(
      'browser-stream',
      MessageType.BROWSER_FRAME_ACK,
      { timestamp: 12345 }
    );
  });

  it('falls back to WebSocket for browser messages when WebRTC disconnected', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';
    mockWebRTCClient.state = 'disconnected';

    manager.send(MessageType.BROWSER_INPUT, {
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 0,
      modifiers: 0,
    });

    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.BROWSER_INPUT, {
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 0,
      modifiers: 0,
    });
    expect(mockWebRTCClient.send).not.toHaveBeenCalled();
  });

  it('routes tunnel:request to file-transfer channel via WebRTC', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');

    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.TUNNEL_REQUEST, {
      tunnelId: 't1',
      requestId: 'req-1',
      method: 'GET',
      path: '/api/data',
      headers: {},
    });

    expect(mockWebRTCClient.send).toHaveBeenCalledWith(
      'file-transfer',
      MessageType.TUNNEL_REQUEST,
      { tunnelId: 't1', requestId: 'req-1', method: 'GET', path: '/api/data', headers: {} }
    );
    expect(mockWsClient.send).not.toHaveBeenCalled();
  });

  it('falls back to WebSocket for tunnel messages when WebRTC disconnected', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';
    mockWebRTCClient.state = 'disconnected';

    manager.send(MessageType.TUNNEL_OPEN, {
      tunnelId: 't1',
      targetPort: 3000,
    });

    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.TUNNEL_OPEN, {
      tunnelId: 't1',
      targetPort: 3000,
    });
    expect(mockWebRTCClient.send).not.toHaveBeenCalled();
  });

  it('sends browser:start via WebSocket (not a stream type)', () => {
    manager.connect('ws://localhost:9800');

    const wsCallback = mockWsClient.connect.mock.calls[0][1];
    wsCallback('connected');
    mockWsClient.state = 'connected';
    mockWebRTCClient.state = 'connected';
    const rtcStateCallback = mockWebRTCClient.createOffer.mock.calls[0][1];
    rtcStateCallback('connected');

    manager.send(MessageType.BROWSER_START, {
      url: 'http://localhost:3000',
      width: 1280,
      height: 720,
      quality: 70,
    });

    // browser:start is a control message, not a stream type - goes via WS
    expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.BROWSER_START, {
      url: 'http://localhost:3000',
      width: 1280,
      height: 720,
      quality: 70,
    });
    expect(mockWebRTCClient.send).not.toHaveBeenCalled();
  });

  // Supabase/WebRTC-only mode: WebSocket is never connected, WebRTC is the only transport
  describe('Supabase/WebRTC-only mode (wsClient not connected)', () => {
    it('routes project:list through WebRTC file-transfer when WebSocket unavailable', () => {
      // In Supabase mode, wsClient is never connected; rtcClient is connected
      mockWsClient.state = 'disconnected';
      mockWebRTCClient.state = 'connected';

      manager.send(MessageType.PROJECT_LIST, {});

      expect(mockWebRTCClient.send).toHaveBeenCalledWith(
        'file-transfer',
        MessageType.PROJECT_LIST,
        {}
      );
      expect(mockWsClient.send).not.toHaveBeenCalled();
    });

    it('routes project:switch through WebRTC file-transfer when WebSocket unavailable', () => {
      mockWsClient.state = 'disconnected';
      mockWebRTCClient.state = 'connected';

      manager.send(MessageType.PROJECT_SWITCH, { projectId: 'p-1' });

      expect(mockWebRTCClient.send).toHaveBeenCalledWith(
        'file-transfer',
        MessageType.PROJECT_SWITCH,
        { projectId: 'p-1' }
      );
      expect(mockWsClient.send).not.toHaveBeenCalled();
    });

    it('routes filetree:list through WebRTC file-transfer when WebSocket unavailable', () => {
      mockWsClient.state = 'disconnected';
      mockWebRTCClient.state = 'connected';

      manager.send(MessageType.FILETREE_LIST, { path: '/' });

      expect(mockWebRTCClient.send).toHaveBeenCalledWith(
        'file-transfer',
        MessageType.FILETREE_LIST,
        { path: '/' }
      );
      expect(mockWsClient.send).not.toHaveBeenCalled();
    });

    it('routes file:read through WebRTC file-transfer when WebSocket unavailable', () => {
      mockWsClient.state = 'disconnected';
      mockWebRTCClient.state = 'connected';

      manager.send(MessageType.FILE_READ, { path: '/src/index.ts' });

      expect(mockWebRTCClient.send).toHaveBeenCalledWith('file-transfer', MessageType.FILE_READ, {
        path: '/src/index.ts',
      });
      expect(mockWsClient.send).not.toHaveBeenCalled();
    });

    it('still falls back to WebSocket when WebRTC not connected and WebSocket is connected', () => {
      mockWsClient.state = 'connected';
      mockWebRTCClient.state = 'disconnected';

      manager.send(MessageType.PROJECT_LIST, {});

      expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.PROJECT_LIST, {});
      expect(mockWebRTCClient.send).not.toHaveBeenCalled();
    });

    it('falls through to WebSocket when WebRTC send throws and WebSocket is connected', () => {
      mockWsClient.state = 'connected';
      mockWebRTCClient.state = 'connected';
      mockWebRTCClient.send.mockImplementationOnce(() => {
        throw new Error('DataChannel not open');
      });

      manager.send(MessageType.PROJECT_LIST, {});

      expect(mockWsClient.send).toHaveBeenCalledWith(MessageType.PROJECT_LIST, {});
    });
  });
});
