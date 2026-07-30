import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { cn } from '../../lib/cn';

const POLL_INTERVAL_MS = 60_000;

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/payments', label: 'Payments', badge: true },
  { to: '/admin/agencies', label: 'Agencies' },
  { to: '/admin/packages', label: 'Packages' },
  { to: '/admin/visa-requests', label: 'Visa' },
  { to: '/admin/staff', label: 'Staff' },
  { to: '/admin/templates', label: 'Templates' },
  { to: '/admin/reports', label: 'Reports' },
];

/** Secondary nav bar shown only for admins — its dark styling is the "you're in admin mode" cue. */
function AdminNav() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      apiGet('/api/admin/payments?status=PENDING_VERIFICATION')
        .then((res) => setPendingCount(res.count))
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="border-t border-neutral-800 bg-neutral-900">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary-400 text-white'
                  : 'border-transparent text-neutral-400 hover:text-white'
              )
            }
          >
            {item.label}
            {item.badge && pendingCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold text-white">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default AdminNav;
