import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageType } from '@vibepilot/protocol';

// We must define mocks inside beforeEach to avoid hoisting issues
let mockDataChannel: any;
let mockPC: any;
let originalRTCPeerConnection: any;
let originalRTCSessionDescription: any;
let originalRTCIceCandidate: any;

describe('VPWebRTCClient', () => {
  beforeEach(() => {
    mockDataChannel = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 'open',
      onopen: null as any,
      onclose: null as any,
      onmessage: null as any,
      label: 'terminal-io',
    };

    mockPC = {
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer-sdp' }),
      createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer-sdp' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addIceCandidate: vi.fn().mockResolvedValue(undefined),
      createDataChannel: vi.fn().mockReturnValue(mockDataChannel),
      close: vi.fn(),
      onicecandidate: null as any,
      ondatachannel: null as any,
      onconnectionstatechange: null as any,
      connectionState: 'new',
      localDescription: { sdp: 'mock-offer-sdp' },
    };

    originalRTCPeerConnection = globalThis.RTCPeerConnection;
    originalRTCSessionDescription = globalThis.RTCSessionDescription;
    originalRTCIceCandidate = globalThis.RTCIceCandidate;

    globalThis.RTCPeerConnection = vi.fn().mockImplementation(() => mockPC) as any;
    globalThis.RTCSessionDescription = vi.fn().mockImplementation((init) => init) as any;
    globalThis.RTCIceCandidate = vi.fn().mockImplementation((init) => init) as any;
  });

  afterEach(() => {
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
    globalThis.RTCSessionDescription = originalRTCSessionDescription;
    globalThis.RTCIceCandidate = originalRTCIceCandidate;
  });

  it('creates a VPWebRTCClient instance with disconnected state', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    expect(client.state).toBe('disconnected');
  });

  it('createOffer creates offer SDP and sends signal', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();
    const onStateChange = vi.fn();

    await client.createOffer(onSignal, onStateChange);

    // Should have created the peer connection
    expect(globalThis.RTCPeerConnection).toHaveBeenCalled();

    // Should have created data channels
    expect(mockPC.createDataChannel).toHaveBeenCalledWith('terminal-io', {
      ordered: true,
      maxRetransmits: 0,
    });
    expect(mockPC.createDataChannel).toHaveBeenCalledWith('file-transfer', {
      ordered: true,
    });

    // Should have created and set local description
    expect(mockPC.createOffer).toHaveBeenCalled();
    expect(mockPC.setLocalDescription).toHaveBeenCalled();

    // Should have sent the offer signal
    expect(onSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SIGNAL_OFFER,
        payload: { sdp: 'mock-offer-sdp' },
      })
    );

    // State should be connecting
    expect(onStateChange).toHaveBeenCalledWith('connecting');
  });

  it('handleAnswer sets remote description', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();

    await client.createOffer(onSignal);
    await client.handleAnswer('mock-answer-sdp');

    expect(mockPC.setRemoteDescription).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'answer',
        sdp: 'mock-answer-sdp',
      })
    );
  });

  it('addIceCandidate adds candidate to peer connection', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();

    await client.createOffer(onSignal);
    await client.addIceCandidate('mock-candidate', 'audio', 0);

    expect(mockPC.addIceCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: 'mock-candidate',
        sdpMid: 'audio',
        sdpMLineIndex: 0,
      })
    );
  });

  it('send sends message through DataChannel', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();

    await client.createOffer(onSignal);

    // Simulate channel open
    const createdChannels = mockPC.createDataChannel.mock.results;
    const terminalChannel = createdChannels[0].value;
    terminalChannel.readyState = 'open';

    client.send('terminal-io', MessageType.TERMINAL_INPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });

    expect(terminalChannel.send).toHaveBeenCalledWith(expect.stringContaining('"terminal:input"'));

    const sentData = JSON.parse(terminalChannel.send.mock.calls[0][0]);
    expect(sentData.type).toBe('terminal:input');
    expect(sentData.payload.sessionId).toBe('sess-1');
    expect(sentData.payload.data).toBe('hello');
  });

  it('send throws if channel is not open', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();

    await client.createOffer(onSignal);

    // Channel is closed
    const createdChannels = mockPC.createDataChannel.mock.results;
    createdChannels[0].value.readyState = 'closed';

    expect(() =>
      client.send('terminal-io', MessageType.TERMINAL_INPUT, {
        sessionId: 'sess-1',
        data: 'hello',
      })
    ).toThrow();
  });

  it('on registers message handler and receives messages', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();
    const handler = vi.fn();

    await client.createOffer(onSignal);
    client.on(MessageType.TERMINAL_OUTPUT, handler);

    // Simulate incoming message on data channel
    const terminalChannel = mockPC.createDataChannel.mock.results[0].value;
    terminalChannel.onmessage?.({
      data: JSON.stringify({
        type: 'terminal:output',
        id: 'msg-1',
        timestamp: Date.now(),
        payload: { sessionId: 'sess-1', data: 'world' },
      }),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'terminal:output',
        payload: { sessionId: 'sess-1', data: 'world' },
      })
    );
  });

  it('on returns unsubscribe function', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();
    const handler = vi.fn();

    await client.createOffer(onSignal);
    const unsub = client.on(MessageType.TERMINAL_OUTPUT, handler);
    unsub();

    // Simulate incoming message
    const terminalChannel = mockPC.createDataChannel.mock.results[0].value;
    terminalChannel.onmessage?.({
      data: JSON.stringify({
        type: 'terminal:output',
        id: 'msg-1',
        timestamp: Date.now(),
        payload: { sessionId: 'sess-1', data: 'world' },
      }),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('close closes peer connection and resets state', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();
    const onStateChange = vi.fn();

    await client.createOffer(onSignal, onStateChange);
    client.close();

    expect(mockPC.close).toHaveBeenCalled();
    expect(client.state).toBe('disconnected');
  });

  it('reports connected state when connectionState changes to connected', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();
    const onStateChange = vi.fn();

    await client.createOffer(onSignal, onStateChange);

    // Simulate connection state change
    mockPC.connectionState = 'connected';
    mockPC.onconnectionstatechange?.();

    expect(onStateChange).toHaveBeenCalledWith('connected');
    expect(client.state).toBe('connected');
  });

  it('reports failed state when connectionState changes to failed', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();
    const onStateChange = vi.fn();

    await client.createOffer(onSignal, onStateChange);

    // Simulate connection failure
    mockPC.connectionState = 'failed';
    mockPC.onconnectionstatechange?.();

    expect(onStateChange).toHaveBeenCalledWith('failed');
    expect(client.state).toBe('failed');
  });

  it('sends ICE candidates through onSignal callback', async () => {
    const { VPWebRTCClient } = await import('@/lib/webrtc');
    const client = new VPWebRTCClient();
    const onSignal = vi.fn();

    await client.createOffer(onSignal);

    // Simulate ICE candidate event
    mockPC.onicecandidate?.({
      candidate: {
        candidate: 'mock-ice-candidate',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });

    // The last call should be the ICE candidate signal
    const candidateCall = onSignal.mock.calls.find(
      (call: any) => call[0].type === MessageType.SIGNAL_CANDIDATE
    );
    expect(candidateCall).toBeTruthy();
    expect(candidateCall[0].payload).toEqual({
      candidate: 'mock-ice-candidate',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
  });
});
