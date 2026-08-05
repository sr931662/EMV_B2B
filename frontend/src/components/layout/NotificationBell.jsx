import { useEffect, useRef, useState } from 'react';
import { Icon, Spinner } from '../ui';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 20;

/**
 * Topbar bell: unread badge (polled), click-to-open panel, mark read/all-read, dismiss.
 *
 * All mutations are optimistic — the list updates immediately and the request is fire-and-forget,
 * because a notification panel that blocks on a round-trip to grey out one row feels broken. A
 * stale count self-corrects on the next poll.
 *
 * The panel is anchored right and width-capped to the viewport on small screens so it can't push
 * the page sideways; on desktop it's a fixed 22rem card.
 */
function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsTotal, setNotificationsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const loadNotifications = () => {
    setLoading(true);
    apiGet(`/api/notifications?limit=${PAGE_SIZE}&offset=0`)
      .then((res) => {
        setNotifications(res.notifications);
        setNotificationsTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadMore = () => {
    setLoadingMore(true);
    apiGet(`/api/notifications?limit=${PAGE_SIZE}&offset=${notifications.length}`)
      .then((res) => {
        setNotifications((prev) => [...prev, ...res.notifications]);
        setNotificationsTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const togglePanel = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) loadNotifications();
      return next;
    });
  };

  const handleMarkRead = async (notificationId) => {
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)));
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
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        className={cn(
          'relative rounded-lg p-2 transition-colors',
          open ? 'bg-neutral-150 text-neutral-800' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
        )}
      >
        <Icon name="bell" size={19} />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full',
              'bg-danger-600 px-1 text-[10px] font-semibold tabular-nums text-white',
              // White ring separates the badge from the icon strokes behind it.
              'ring-2 ring-white'
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-scale-in origin-top-right',
            'overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-900/5'
          )}
        >
          <div className="flex items-center justify-between border-b border-neutral-200/80 px-4 py-3">
            <span className="text-sm font-semibold text-neutral-900">Notifications</span>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                  <Icon name="bell" size={17} />
                </span>
                <p className="text-sm text-neutral-500">You&apos;re all caught up.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'group relative flex items-start gap-2.5 border-b border-neutral-150 px-4 py-3 transition-colors last:border-0',
                    n.isRead ? 'hover:bg-neutral-50' : 'bg-primary-50/50 hover:bg-primary-50'
                  )}
                >
                  {/* Unread marker doubles as the alignment anchor for the text block. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      n.isRead ? 'bg-transparent' : 'bg-primary-500'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => !n.isRead && handleMarkRead(n.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p
                      className={cn(
                        'text-[13px] leading-snug',
                        n.isRead ? 'text-neutral-600' : 'font-medium text-neutral-900'
                      )}
                    >
                      {n.message}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-400">{formatDateTime(n.createdAt)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleArchive(n.id, e)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-md p-1 text-neutral-300 opacity-0 transition-all hover:bg-neutral-200/70 hover:text-neutral-600 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))
            )}

            {!loading && notifications.length > 0 && notifications.length < notificationsTotal && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex w-full items-center justify-center gap-2 border-t border-neutral-150 py-2.5 text-[12.5px] font-medium text-primary-600 transition-colors hover:bg-neutral-50 hover:text-primary-700 disabled:text-neutral-400"
              >
                {loadingMore ? <Spinner size="sm" /> : `Load more (${notificationsTotal - notifications.length} more)`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
