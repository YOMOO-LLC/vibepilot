import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/transport', () => ({
  transportManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    activeTransport: 'websocket',
  },
  TransportManager: vi.fn(),
}));

vi.mock('@/lib/websocket', () => ({
  wsClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
    state: 'disconnected',
  },
  VPWebSocketClient: vi.fn(),
}));

vi.mock('@/lib/webrtc', () => ({
  VPWebRTCClient: vi.fn(),
}));

import { DevicePicker } from '@/components/connection/DevicePicker';
import { useConnectionStore } from '@/stores/connectionStore';

describe('DevicePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      state: 'disconnected',
      webrtcState: 'disconnected',
      activeTransport: 'websocket',
      url: 'ws://localhost:9800',
    });
  });

  it('displays default URL in input', () => {
    render(<DevicePicker />);
    const input = screen.getByTestId('device-picker-url') as HTMLInputElement;
    expect(input.value).toBe('ws://localhost:9800');
  });

  it('allows user to change URL', () => {
    render(<DevicePicker />);
    const input = screen.getByTestId('device-picker-url') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ws://192.168.1.100:9800' } });
    expect(input.value).toBe('ws://192.168.1.100:9800');
  });

  it('shows Connect button when disconnected', () => {
    render(<DevicePicker />);
    expect(screen.getByText('Connect')).toBeDefined();
  });

  it('clicking Connect triggers connect with URL', () => {
    const connect = vi.fn();
    useConnectionStore.setState({ connect });

    render(<DevicePicker />);

    const connectBtn = screen.getByText('Connect');
    fireEvent.click(connectBtn);

    expect(connect).toHaveBeenCalledWith('ws://localhost:9800');
  });

  it('clicking Connect with modified URL triggers connect with new URL', () => {
    const connect = vi.fn();
    useConnectionStore.setState({ connect });

    render(<DevicePicker />);

    const input = screen.getByTestId('device-picker-url') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ws://10.0.0.5:9800' } });

    const connectBtn = screen.getByText('Connect');
    fireEvent.click(connectBtn);

    expect(connect).toHaveBeenCalledWith('ws://10.0.0.5:9800');
  });

  it('shows Disconnect button when connected', () => {
    useConnectionStore.setState({ state: 'connected' });

    render(<DevicePicker />);
    expect(screen.getByText('Disconnect')).toBeDefined();
  });

  it('clicking Disconnect triggers disconnect', () => {
    const disconnect = vi.fn();
    useConnectionStore.setState({ state: 'connected', disconnect });

    render(<DevicePicker />);

    const disconnectBtn = screen.getByText('Disconnect');
    fireEvent.click(disconnectBtn);

    expect(disconnect).toHaveBeenCalled();
  });

  it('disables URL input when connected', () => {
    useConnectionStore.setState({ state: 'connected' });

    render(<DevicePicker />);
    const input = screen.getByTestId('device-picker-url') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('shows Connecting... button when connecting', () => {
    useConnectionStore.setState({ state: 'connecting' });

    render(<DevicePicker />);
    expect(screen.getByText('Connecting...')).toBeDefined();
  });
});
