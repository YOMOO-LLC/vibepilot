import { create } from 'zustand';

export type NotificationType = 'error' | 'warning' | 'info' | 'success';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  detail?: string;
  timestamp: number;
  autoDismiss?: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  add: (type: NotificationType, message: string, detail?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let notifCounter = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  add: (type, message, detail?) => {
    notifCounter++;
    const id = `notif-${Date.now()}-${notifCounter}`;
    const notification: Notification = {
      id,
      type,
      message,
      detail,
      timestamp: Date.now(),
      autoDismiss: type !== 'error',
    };

    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-dismiss non-error notifications after 5 seconds
    if (notification.autoDismiss) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, 5000);
    }
  },

  dismiss: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clear: () => {
    set({ notifications: [] });
  },
}));
