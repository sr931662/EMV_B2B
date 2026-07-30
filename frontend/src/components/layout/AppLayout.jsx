import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui';
import NotificationBell from './NotificationBell';
import AdminNav from './AdminNav';
import { cn } from '../../lib/cn';

/** Shared chrome for every authenticated page: top nav + content outlet. Admins get a distinct
 * dark secondary nav bar and an "Admin" marker so it's unmistakable which side you're on;
 * data_feeder gets a minimal single-link nav since Library is their only destination. */
function AppLayout() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === 'admin';
  const isDataFeeder = role === 'data_feeder';
  // Falls back to a text wordmark if /logo.png fails to load.
  const [logoError, setLogoError] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className={cn('bg-white', !isAdmin && !isDataFeeder && 'border-b border-neutral-200')}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {logoError ? (
              <span className="font-semibold text-neutral-900">TravNexa Global</span>
            ) : (
              <img
                src="/logo.png"
                alt="TravNexa Global"
                className="h-9 w-auto object-contain"
                onError={() => setLogoError(true)}
              />
            )}
            {isAdmin && (
              <span className="ml-1 rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                Admin
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <NotificationBell />
            <span className="text-sm text-neutral-600">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
        {isAdmin && <AdminNav />}
        {isDataFeeder && (
          <nav className="border-t border-neutral-200 bg-white">
            <div className="mx-auto max-w-6xl px-4">
              <Link
                to="/library"
                className="inline-block border-b-2 border-primary-600 px-3 py-2.5 text-sm font-medium text-primary-700"
              >
                Library
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
