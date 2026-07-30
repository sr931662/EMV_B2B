import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../ui/Spinner';

/**
 * Route guard. Two usage shapes are both supported:
 *   - as a layout route: <Route element={<RequireAuth roles={['admin']} />}>...<Outlet/> children</Route>
 *   - wrapping a single element directly: <RequireAuth roles={['admin']}><SomePage /></RequireAuth>
 *
 * Unauthenticated -> /login (remembers the attempted location in router state, for a future
 * "redirect back after login" — not wired yet since login itself is still a placeholder).
 * Authenticated but wrong role -> /403.
 */
function RequireAuth({ roles, children }) {
  const { isAuthenticated, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  return children ?? <Outlet />;
}

export default RequireAuth;
