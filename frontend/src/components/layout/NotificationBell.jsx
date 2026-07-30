import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../ui';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const POLL_INTERVAL_MS = 60_000;

/** Top-nav bell: unread badge (polled), click-to-open panel, mark read/all-read, dismiss. */
function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const refreshUnreadCount = () => {
    apiGet('/api/notifications/unread-count')
      .then((res) => setUnreadCount(res.count))
      .catch(() => {
        // Silent — a failed poll shouldn't surface as an error to the whole layout.
      });
  };

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const loadNotifications = () => {
    setLoading(true);
    apiGet('/api/notifications')
      .then((res) => setNotifications(res.notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const togglePanel = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) loadNotifications();
      return next;
    });
  };

  const handleMarkRead = async (notificationId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiPost(`/api/notifications/${notificationId}/read`);
    } catch {
      // Best-effort — a stale badge count self-corrects on the next poll.
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await apiPost('/api/notifications/read-all');
    } catch {
      // Best-effort, same as above.
    }
  };

  const handleArchive = async (notificationId, e) => {
    e.stopPropagation();
    const wasUnread = notifications.find((n) => n.id === notificationId)?.isRead === false;
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiDelete(`/api/notifications/${notificationId}`);
    } catch {
      // Best-effort — worst case it reappears on the next open.
    }
  };

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={togglePanel}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <span className="text-sm font-semibold text-neutral-900">Notifications</span>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-2 border-b border-neutral-100 px-4 py-3 last:border-0',
                    !n.isRead && 'bg-primary-50/60'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => !n.isRead && handleMarkRead(n.id)}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm text-neutral-800">{n.message}</p>
                    <p className="mt-1 text-xs text-neutral-400">{formatDateTime(n.createdAt)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleArchive(n.id, e)}
                    aria-label="Dismiss"
                    className="text-neutral-300 hover:text-neutral-500"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
