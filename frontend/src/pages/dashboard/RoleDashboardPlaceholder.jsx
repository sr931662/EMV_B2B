import { Badge, Card, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

/** Shared shell for the not-yet-built role landing screens. */
function RoleDashboardPlaceholder({ title }) {
  const { user, role } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} subtitle="This screen will be built in a later prompt." />

      <Card title="Session" className="max-w-md">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Role</dt>
            <dd>
              <Badge variant="primary">{role}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-neutral-150 pt-3">
            <dt className="text-neutral-500">Email</dt>
            <dd className="truncate font-medium text-neutral-900">{user?.email}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

export default RoleDashboardPlaceholder;
