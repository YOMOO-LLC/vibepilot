import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useNotificationStore } from '@/stores/notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.setState({ notifications: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty notifications', () => {
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toEqual([]);
  });

  it('add() creates a notification with correct fields', () => {
    useNotificationStore.getState().add('error', 'Something failed', 'Check logs');

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: 'error',
      message: 'Something failed',
      detail: 'Check logs',
    });
    expect(notifications[0].id).toMatch(/^notif-/);
    expect(notifications[0].timestamp).toBeGreaterThan(0);
  });

  it('add() supports all notification types', () => {
    const store = useNotificationStore.getState();
    store.add('error', 'Error message');
    store.add('warning', 'Warning message');
    store.add('info', 'Info message');
    store.add('success', 'Success message');

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(4);
    expect(notifications.map((n) => n.type)).toEqual(['error', 'warning', 'info', 'success']);
  });

  it('error notifications do NOT auto-dismiss', () => {
    useNotificationStore.getState().add('error', 'Persistent error');

    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].autoDismiss).toBe(false);

    // Advance past auto-dismiss timeout
    vi.advanceTimersByTime(6000);

    const after = useNotificationStore.getState().notifications;
    expect(after).toHaveLength(1); // Still there
  });

  it('non-error notifications auto-dismiss after 5 seconds', () => {
    useNotificationStore.getState().add('info', 'Temporary info');

    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(4999);
    expect(useNotificationStore.getState().notifications).toHaveLength(1); // Still there

    vi.advanceTimersByTime(1);
    expect(useNotificationStore.getState().notifications).toHaveLength(0); // Gone
  });

  it('warning notifications auto-dismiss', () => {
    useNotificationStore.getState().add('warning', 'Temporary warning');

    vi.advanceTimersByTime(5000);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('success notifications auto-dismiss', () => {
    useNotificationStore.getState().add('success', 'Temporary success');

    vi.advanceTimersByTime(5000);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('dismiss() removes a specific notification', () => {
    const store = useNotificationStore.getState();
    store.add('error', 'Error 1');
    store.add('error', 'Error 2');

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(2);

    store.dismiss(notifications[0].id);

    const after = useNotificationStore.getState().notifications;
    expect(after).toHaveLength(1);
    expect(after[0].message).toBe('Error 2');
  });

  it('dismiss() is no-op for non-existent id', () => {
    useNotificationStore.getState().add('info', 'Test');
    useNotificationStore.getState().dismiss('non-existent-id');

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('clear() removes all notifications', () => {
    const store = useNotificationStore.getState();
    store.add('error', 'Error 1');
    store.add('warning', 'Warning 1');
    store.add('info', 'Info 1');

    expect(useNotificationStore.getState().notifications).toHaveLength(3);

    store.clear();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('multiple notifications accumulate in order', () => {
    const store = useNotificationStore.getState();
    store.add('error', 'First');
    store.add('info', 'Second');
    store.add('warning', 'Third');

    const messages = useNotificationStore.getState().notifications.map((n) => n.message);
    expect(messages).toEqual(['First', 'Second', 'Third']);
  });

  it('detail is optional', () => {
    useNotificationStore.getState().add('info', 'No detail');

    const notif = useNotificationStore.getState().notifications[0];
    expect(notif.detail).toBeUndefined();
  });

  it('each notification gets a unique id', () => {
    const store = useNotificationStore.getState();
    store.add('info', 'A');
    store.add('info', 'B');
    store.add('info', 'C');

    const ids = useNotificationStore.getState().notifications.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});
