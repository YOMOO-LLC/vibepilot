import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { MessageType, createMessage } from '@vibepilot/protocol';
import { SignalingHandler } from '../../src/transport/SignalingHandler.js';

// Create a mock WebRTCPeer
function createMockPeer() {
  const emitter = new EventEmitter();
  const mock = {
    handleOffer: vi.fn().mockResolvedValue('v=0\r\nanswer-sdp\r\n'),
    addIceCandidate: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
  };
  return mock;
}

describe('SignalingHandler', () => {
  let mockPeer: ReturnType<typeof createMockPeer>;
  let handler: SignalingHandler;
  let sendResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPeer = createMockPeer();
    handler = new SignalingHandler(mockPeer as any);
    sendResponse = vi.fn();
  });

  it('handles signal:offer and sends back signal:answer', async () => {
    const offerMsg = createMessage(MessageType.SIGNAL_OFFER, {
      sdp: 'v=0\r\noffer-sdp\r\n',
    });

    handler.handleMessage(offerMsg, sendResponse);

    // Wait for the async handleOffer to resolve
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    expect(mockPeer.handleOffer).toHaveBeenCalledWith('v=0\r\noffer-sdp\r\n');

    const sentMsg = sendResponse.mock.calls[0][0];
    expect(sentMsg.type).toBe(MessageType.SIGNAL_ANSWER);
    expect(sentMsg.payload.sdp).toBe('v=0\r\nanswer-sdp\r\n');
  });

  it('handles signal:candidate and calls peer.addIceCandidate', () => {
    const candidateMsg = createMessage(MessageType.SIGNAL_CANDIDATE, {
      candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });

    handler.handleMessage(candidateMsg, sendResponse);

    expect(mockPeer.addIceCandidate).toHaveBeenCalledWith(
      'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
      '0'
    );
  });

  it('forwards peer ICE candidates via sendResponse', () => {
    // Create handler with a stored sendResponse
    const persistentSend = vi.fn();
    handler.setSendFunction(persistentSend);

    // Simulate the peer emitting a local ICE candidate
    mockPeer.emit(
      'candidate',
      'candidate:2 1 UDP 1694498815 192.168.1.1 5001 typ srflx',
      '0'
    );

    expect(persistentSend).toHaveBeenCalled();
    const sentMsg = persistentSend.mock.calls[0][0];
    expect(sentMsg.type).toBe(MessageType.SIGNAL_CANDIDATE);
    expect(sentMsg.payload.candidate).toBe(
      'candidate:2 1 UDP 1694498815 192.168.1.1 5001 typ srflx'
    );
    expect(sentMsg.payload.sdpMid).toBe('0');
  });

  it('handles signal:answer message', () => {
    const answerMsg = createMessage(MessageType.SIGNAL_ANSWER, {
      sdp: 'v=0\r\nanswer-sdp\r\n',
    });

    // Should not throw - answer messages may come in if agent also sends offers
    expect(() => {
      handler.handleMessage(answerMsg, sendResponse);
    }).not.toThrow();
  });

  it('ignores non-signal messages', () => {
    const terminalMsg = createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
    });

    handler.handleMessage(terminalMsg, sendResponse);

    expect(mockPeer.handleOffer).not.toHaveBeenCalled();
    expect(mockPeer.addIceCandidate).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
