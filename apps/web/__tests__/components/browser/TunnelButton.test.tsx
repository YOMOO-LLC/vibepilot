import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TunnelButton } from '@/components/browser/TunnelButton';

// Mock stores
const mockOpenTunnelForPort = vi.fn();
const mockCloseTunnel = vi.fn();
let mockTunnelStoreState: any = { tunnels: {} };

vi.mock('@/stores/tunnelStore', () => ({
  useTunnelStore: (selector: any) =>
    typeof selector === 'function' ? selector(mockTunnelStoreState) : mockTunnelStoreState,
}));

vi.mock('@/lib/tunnelBridge', () => ({
  getTunnelUrl: (port: number) => `http://localhost:3000/__tunnel__/${port}/`,
}));

// Mock window.open
const mockWindowOpen = vi.fn();

describe('TunnelButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTunnelStoreState = {
      tunnels: {},
      openTunnelForPort: mockOpenTunnelForPort,
      closeTunnel: mockCloseTunnel,
    };
    window.open = mockWindowOpen;
  });

  it('renders "Open in Browser" button for a port URL', () => {
    render(<TunnelButton url="http://localhost:3000" />);
    expect(screen.getByText(/Open in Browser/i)).toBeTruthy();
  });

  it('shows port number in button text', () => {
    render(<TunnelButton url="http://localhost:3000" />);
    expect(screen.getByText(/3000/)).toBeTruthy();
  });

  it('opens tunnel when clicked and tunnel is not open', () => {
    render(<TunnelButton url="http://localhost:3000" />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockOpenTunnelForPort).toHaveBeenCalledWith(3000);
  });

  it('shows "Opening..." when tunnel is in opening state', () => {
    mockTunnelStoreState = {
      ...mockTunnelStoreState,
      tunnels: {
        'port-3000': { tunnelId: 'port-3000', targetPort: 3000, state: 'opening' },
      },
    };

    render(<TunnelButton url="http://localhost:3000" />);
    expect(screen.getByText(/Opening/i)).toBeTruthy();
  });

  it('shows "Connected" when tunnel is open', () => {
    mockTunnelStoreState = {
      ...mockTunnelStoreState,
      tunnels: {
        'port-3000': { tunnelId: 'port-3000', targetPort: 3000, state: 'open' },
      },
    };

    render(<TunnelButton url="http://localhost:3000" />);
    expect(screen.getByText(/Connected/i)).toBeTruthy();
  });

  it('shows error state when tunnel has error', () => {
    mockTunnelStoreState = {
      ...mockTunnelStoreState,
      tunnels: {
        'port-3000': {
          tunnelId: 'port-3000',
          targetPort: 3000,
          state: 'error',
          error: 'Connection refused',
        },
      },
    };

    render(<TunnelButton url="http://localhost:3000" />);
    expect(screen.getByText(/Error/i)).toBeTruthy();
  });

  it('extracts port from URL correctly', () => {
    render(<TunnelButton url="http://localhost:8080" />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockOpenTunnelForPort).toHaveBeenCalledWith(8080);
  });

  it('opens new tab when tunnel is open and clicked', () => {
    mockTunnelStoreState = {
      ...mockTunnelStoreState,
      tunnels: {
        'port-3000': { tunnelId: 'port-3000', targetPort: 3000, state: 'open' },
      },
    };

    render(<TunnelButton url="http://localhost:3000" />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockWindowOpen).toHaveBeenCalledWith('http://localhost:3000/__tunnel__/3000/', '_blank');
  });
});
