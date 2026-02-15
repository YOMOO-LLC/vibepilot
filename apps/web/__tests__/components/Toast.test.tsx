import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from '@/components/Toast';
import { useNotificationStore } from '@/stores/notificationStore';

describe('ToastContainer', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
  });

  it('renders nothing when no notifications', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('renders error notification with correct test-id', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-1',
          type: 'error',
          message: 'Connection failed',
          timestamp: Date.now(),
          autoDismiss: false,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByTestId('toast-error')).toBeTruthy();
    expect(screen.getByText('Connection failed')).toBeTruthy();
  });

  it('renders warning notification', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-2',
          type: 'warning',
          message: 'Slow connection',
          timestamp: Date.now(),
          autoDismiss: true,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByTestId('toast-warning')).toBeTruthy();
    expect(screen.getByText('Slow connection')).toBeTruthy();
  });

  it('renders info notification', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-3',
          type: 'info',
          message: 'Connected to agent',
          timestamp: Date.now(),
          autoDismiss: true,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByTestId('toast-info')).toBeTruthy();
    expect(screen.getByText('Connected to agent')).toBeTruthy();
  });

  it('renders success notification', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-4',
          type: 'success',
          message: 'File saved',
          timestamp: Date.now(),
          autoDismiss: true,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByTestId('toast-success')).toBeTruthy();
    expect(screen.getByText('File saved')).toBeTruthy();
  });

  it('renders detail text when provided', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-5',
          type: 'error',
          message: 'Operation failed',
          detail: 'Timeout after 30s',
          timestamp: Date.now(),
          autoDismiss: false,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByText('Operation failed')).toBeTruthy();
    expect(screen.getByText('Timeout after 30s')).toBeTruthy();
  });

  it('does not render detail when not provided', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-6',
          type: 'info',
          message: 'Just a message',
          timestamp: Date.now(),
          autoDismiss: true,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByText('Just a message')).toBeTruthy();
    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('renders multiple notifications', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-7',
          type: 'error',
          message: 'Error message',
          timestamp: Date.now(),
          autoDismiss: false,
        },
        {
          id: 'test-8',
          type: 'info',
          message: 'Info message',
          timestamp: Date.now(),
          autoDismiss: true,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByText('Error message')).toBeTruthy();
    expect(screen.getByText('Info message')).toBeTruthy();
  });

  it('dismiss button calls dismiss with correct id', () => {
    const dismissSpy = vi.fn();
    useNotificationStore.setState({
      notifications: [
        {
          id: 'test-dismiss',
          type: 'error',
          message: 'Dismissable error',
          timestamp: Date.now(),
          autoDismiss: false,
        },
      ],
      dismiss: dismissSpy,
    });

    render(<ToastContainer />);

    // Find and click the dismiss button (the X button)
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);

    expect(dismissSpy).toHaveBeenCalledWith('test-dismiss');
  });
});
