import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageType, createMessage } from '@vibepilot/protocol';

// Mock node-datachannel before importing WebRTCPeer
const mockDataChannel = () => ({
  onOpen: vi.fn(),
  onClosed: vi.fn(),
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
  close: vi.fn(),
  isOpen: vi.fn().mockReturnValue(true),
  getLabel: vi.fn().mockReturnValue('test'),
});

let onLocalDescriptionCb: ((sdp: string, type: string) => void) | null = null;
let onLocalCandidateCb: ((candidate: string, mid: string) => void) | null = null;
let onDataChannelCb: ((dc: ReturnType<typeof mockDataChannel>) => void) | null = null;
let onStateChangeCb: ((state: string) => void) | null = null;

const mockPeerConnection = () => ({
  setLocalDescription: vi.fn(),
  setRemoteDescription: vi.fn(),
  addRemoteCandidate: vi.fn(),
  createDataChannel: vi.fn().mockImplementation((label: string) => {
    const dc = mockDataChannel();
    dc.getLabel = vi.fn().mockReturnValue(label);
    return dc;
  }),
  onLocalDescription: vi.fn().mockImplementation((cb: any) => {
    onLocalDescriptionCb = cb;
  }),
  onLocalCandidate: vi.fn().mockImplementation((cb: any) => {
    onLocalCandidateCb = cb;
  }),
  onDataChannel: vi.fn().mockImplementation((cb: any) => {
    onDataChannelCb = cb;
  }),
  onStateChange: vi.fn().mockImplementation((cb: any) => {
    onStateChangeCb = cb;
  }),
  close: vi.fn(),
  state: vi.fn().mockReturnValue('connected'),
});

vi.mock('node-datachannel', () => ({
  PeerConnection: vi.fn().mockImplementation(() => mockPeerConnection()),
}));

// Import after mock setup
import { WebRTCPeer } from '../../src/transport/WebRTCPeer.js';

describe('WebRTCPeer', () => {
  let peer: WebRTCPeer;

  beforeEach(() => {
    onLocalDescriptionCb = null;
    onLocalCandidateCb = null;
    onDataChannelCb = null;
    onStateChangeCb = null;
    peer = new WebRTCPeer();
  });

  afterEach(() => {
    peer.close();
  });

  it('creates a peer instance', () => {
    expect(peer).toBeInstanceOf(WebRTCPeer);
  });

  it('handleOffer returns an answer SDP', async () => {
    const offerSdp = 'v=0\r\no=- 1234 1 IN IP4 127.0.0.1\r\n';

    // Simulate the local description callback being fired after setRemoteDescription
    const answerPromise = peer.handleOffer(offerSdp);

    // The PeerConnection should fire onLocalDescription with the answer
    // We simulate this asynchronously
    setTimeout(() => {
      if (onLocalDescriptionCb) {
        onLocalDescriptionCb('v=0\r\no=- 5678 1 IN IP4 127.0.0.1\r\n', 'answer');
      }
    }, 10);

    const answerSdp = await answerPromise;
    expect(answerSdp).toBe('v=0\r\no=- 5678 1 IN IP4 127.0.0.1\r\n');
  });

  it('addIceCandidate does not throw', () => {
    expect(() => {
      peer.addIceCandidate('candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host', 'audio');
    }).not.toThrow();
  });

  it('addIceCandidate with sdpMid and sdpMLineIndex does not throw', () => {
    expect(() => {
      peer.addIceCandidate(
        'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
        '0'
      );
    }).not.toThrow();
  });

  it('send method sends message to DataChannel', () => {
    // Create a mock data channel and simulate it being open
    const dc = mockDataChannel();
    dc.getLabel = vi.fn().mockReturnValue('terminal-io');

    // Simulate the datachannel being opened by remote side
    if (onDataChannelCb) {
      onDataChannelCb(dc);
    }

    // Capture the onOpen handler and call it
    const onOpenCall = dc.onOpen.mock.calls[0];
    if (onOpenCall && onOpenCall[0]) {
      onOpenCall[0](); // trigger onOpen callback
    }

    const msg = createMessage(MessageType.TERMINAL_OUTPUT, {
      sessionId: 'sess-1',
      data: 'hello',
    });

    peer.send('terminal-io', msg);

    expect(dc.sendMessage).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('close closes the peer connection', () => {
    peer.close();
    // Should not throw on double-close
    expect(() => peer.close()).not.toThrow();
  });

  it('emits connected event on state change to connected', () => {
    const connectedSpy = vi.fn();
    peer.on('connected', connectedSpy);

    if (onStateChangeCb) {
      onStateChangeCb('connected');
    }

    expect(connectedSpy).toHaveBeenCalled();
  });

  it('emits disconnected event on state change to disconnected', () => {
    const disconnectedSpy = vi.fn();
    peer.on('disconnected', disconnectedSpy);

    if (onStateChangeCb) {
      onStateChangeCb('disconnected');
    }

    expect(disconnectedSpy).toHaveBeenCalled();
  });

  it('emits candidate event when local ICE candidate is generated', () => {
    const candidateSpy = vi.fn();
    peer.on('candidate', candidateSpy);

    if (onLocalCandidateCb) {
      onLocalCandidateCb('candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host', '0');
    }

    expect(candidateSpy).toHaveBeenCalledWith(
      'candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host',
      '0'
    );
  });

  it('emits datachannel-open when a channel opens', () => {
    const openSpy = vi.fn();
    peer.on('datachannel-open', openSpy);

    const dc = mockDataChannel();
    dc.getLabel = vi.fn().mockReturnValue('terminal-io');

    if (onDataChannelCb) {
      onDataChannelCb(dc);
    }

    // Trigger the onOpen callback
    const onOpenCall = dc.onOpen.mock.calls[0];
    if (onOpenCall && onOpenCall[0]) {
      onOpenCall[0]();
    }

    expect(openSpy).toHaveBeenCalledWith('terminal-io');
  });

  it('emits message event when data is received on a channel', () => {
    const messageSpy = vi.fn();
    peer.on('message', messageSpy);

    const dc = mockDataChannel();
    dc.getLabel = vi.fn().mockReturnValue('terminal-io');

    if (onDataChannelCb) {
      onDataChannelCb(dc);
    }

    // Trigger the onMessage callback with a VPMessage
    const onMessageCall = dc.onMessage.mock.calls[0];
    if (onMessageCall && onMessageCall[0]) {
      const msg = createMessage(MessageType.TERMINAL_INPUT, {
        sessionId: 'sess-1',
        data: 'ls\r',
      });
      onMessageCall[0](JSON.stringify(msg));
    }

    expect(messageSpy).toHaveBeenCalled();
    const [channel, receivedMsg] = messageSpy.mock.calls[0];
    expect(channel).toBe('terminal-io');
    expect(receivedMsg.type).toBe(MessageType.TERMINAL_INPUT);
  });
});
