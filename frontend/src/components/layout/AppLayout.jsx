import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui';
import NotificationBell from './NotificationBell';
import Sidebar from './Sidebar';
import Brand from './Brand';
import { apiGet } from '../../api/client';
import { cn } from '../../lib/cn';
import { navForRole, ROLE_LABELS } from '../../lib/navigation';

const POLL_INTERVAL_MS = 60_000;

/**
 * Shared chrome for every authenticated page.
 *
 * Structure: a fixed dark navigation rail from `lg` up, a slide-in drawer below that, and a
 * sticky topbar carrying the current section name plus the notification bell and account menu.
 *
 * This replaces a horizontal top-nav that only existed for admins — partners previously had no
 * navigation at all and had to rely on whatever buttons a page happened to render. A persistent
 * rail also scales to the admin's nine destinations without the overflow-scrolling tab strip the
 * old bar needed.
 *
 * The pending-payments count is polled here rather than inside Sidebar because Sidebar is
 * mounted twice (desktop rail + mobile drawer) and would otherwise double every request.
 */
function AppLayout() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingPayments, setPendingPayments] = useState(0);

  const isAdmin = role === 'admin';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Admin-only queue badge. Same endpoint and cadence the old AdminNav used.
  useEffect(() => {
    if (!isAdmin) return undefined;

    const refresh = () => {
      apiGet('/api/admin/payments?status=PENDING_VERIFICATION')
        .then((res) => setPendingPayments(res.count))
        .catch(() => {
          // Silent — a failed poll must not surface as an error on every page.
        });
    };

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // A drawer left open across a navigation would cover the page the user just asked for.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer, and background scroll is locked while it covers the page.
  useEffect(() => {
    if (!drawerOpen) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  // Section name for the topbar: the deepest nav item whose path prefixes the current URL, so
  // /packages/:id/quote still reads "Packages" rather than going blank on detail routes.
  const currentSection = navForRole(role)
    .flatMap((section) => section.items)
    .filter((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const sidebarProps = {
    role,
    user,
    badges: { pendingPayments },
    onLogout: handleLogout,
  };

  return (
    <div className="min-h-dvh bg-neutral-100">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-neutral-950/50 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] animate-drawer-in shadow-xl"
          >
            <Sidebar {...sidebarProps} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon name="x" size={18} />
            </button>
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="lg:pl-64">
        <header
          className={cn(
            'sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-neutral-200/80 px-4 sm:px-6 lg:px-8',
            // Translucent + blur so content scrolling underneath stays faintly visible, which
            // makes the bar feel attached to the page rather than floating over it.
            'bg-white/85 backdrop-blur-md'
          )}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 lg:hidden"
          >
            <Icon name="menu" size={20} />
          </button>

          {/* On phones the rail is hidden, so the wordmark has to live here. */}
          <div className="lg:hidden">
            <Brand imgClassName="h-7" />
          </div>

          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[15px] font-semibold text-neutral-900">
              {currentSection?.label ?? ROLE_LABELS[role] ?? 'TravNexa Global'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell />

            <div className="hidden items-center gap-2.5 pl-2 sm:flex">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold uppercase text-primary-700 ring-1 ring-inset ring-primary-100">
                {(user?.email ?? '?').slice(0, 2)}
              </span>
              <span className="hidden max-w-[13rem] flex-col leading-tight xl:flex">
                <span className="truncate text-[13px] font-medium text-neutral-800">
                  {user?.partnerProfile?.companyName ?? user?.email}
                </span>
                <span className="truncate text-[11px] text-neutral-500">{ROLE_LABELS[role]}</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Log out"
                title="Log out"
              >
                <Icon name="logout" size={17} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
