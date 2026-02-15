'use client';

import { useNotificationStore, type NotificationType } from '@/stores/notificationStore';

const typeStyles: Record<NotificationType, { bg: string; border: string; icon: string }> = {
  error: {
    bg: 'bg-red-950/90',
    border: 'border-red-800',
    icon: 'text-red-400',
  },
  warning: {
    bg: 'bg-yellow-950/90',
    border: 'border-yellow-800',
    icon: 'text-yellow-400',
  },
  info: {
    bg: 'bg-blue-950/90',
    border: 'border-blue-800',
    icon: 'text-blue-400',
  },
  success: {
    bg: 'bg-green-950/90',
    border: 'border-green-800',
    icon: 'text-green-400',
  },
};

const typeIcons: Record<NotificationType, string> = {
  error:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  warning:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  info: 'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  success: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

export function ToastContainer() {
  const { notifications, dismiss } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {notifications.map((notif) => {
        const style = typeStyles[notif.type];
        return (
          <div
            key={notif.id}
            className={`${style.bg} ${style.border} border rounded-lg shadow-lg p-3 animate-in fade-in slide-in-from-right-2`}
            data-testid={`toast-${notif.type}`}
          >
            <div className="flex items-start gap-2">
              <svg
                className={`w-4 h-4 mt-0.5 flex-shrink-0 ${style.icon}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={typeIcons[notif.type]} />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200">{notif.message}</p>
                {notif.detail && (
                  <p className="text-xs text-zinc-400 mt-1 truncate">{notif.detail}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(notif.id)}
                className="text-zinc-500 hover:text-zinc-300 flex-shrink-0"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
