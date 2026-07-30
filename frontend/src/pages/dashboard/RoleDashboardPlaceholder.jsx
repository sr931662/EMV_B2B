import { Badge, Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

/** Shared shell for the not-yet-built role landing screens. */
function RoleDashboardPlaceholder({ title }) {
  const { user, role } = useAuth();

  return (
    <Card>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">This screen will be built in a later prompt.</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="text-neutral-500">Role</dt>
          <dd>
            <Badge>{role}</Badge>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-neutral-500">Email</dt>
          <dd className="text-neutral-900">{user?.email}</dd>
        </div>
      </dl>
    </Card>
  );
}

export default RoleDashboardPlaceholder;
