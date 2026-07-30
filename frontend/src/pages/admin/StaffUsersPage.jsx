import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  PasswordInput,
  Select,
  Skeleton,
  Switch,
  Table,
  useToast,
} from '../../components/ui';
import ConfirmModal from '../../components/admin/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { formatDate } from '../../lib/format';
import { cn } from '../../lib/cn';
import { isEmailValid, isPasswordValid } from '../../lib/validators';

const ROLE_OPTIONS = [
  { value: 'data_feeder', label: 'Data Feeder' },
  { value: 'admin', label: 'Admin' },
];

function StaffUsersPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'data_feeder' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);

  const [confirmTarget, setConfirmTarget] = useState(null); // { user, action: 'suspend'|'activate' }

  const load = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/admin/users?includeArchived=${includeArchived}`)
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load staff users.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  const openCreate = () => {
    setForm({ email: '', password: '', role: 'data_feeder' });
    setErrors({});
    setFormError(null);
    setCreatedCreds(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Required';
    else if (!isEmailValid(form.email)) nextErrors.email = 'Enter a valid email address';
    if (!isPasswordValid(form.password)) {
      nextErrors.password = 'At least 8 characters, with a letter and a number';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = { email: form.email.trim().toLowerCase(), password: form.password, role: form.role };
      await apiPost('/api/admin/users', payload);
      setCreatedCreds({ email: payload.email, password: payload.password, role: payload.role });
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  // Throws on failure so ConfirmModal shows the error inline (e.g. the backend's "you cannot
  // suspend your own account" 400) instead of silently closing.
  const handleConfirmAction = async () => {
    const { user, action } = confirmTarget;
    await apiPost(`/api/admin/users/${user.id}/${action}`);
    showToast({ variant: 'success', message: `${user.email} ${action === 'suspend' ? 'suspended' : 'activated'}.` });
    setConfirmTarget(null);
    await load();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Staff Users"
        subtitle="Internal admin and data-feeder accounts. Created pre-verified, with no OTP step."
        actions={
          <Button onClick={openCreate}>
            <Icon name="plus" size={16} />
            Create staff account
          </Button>
        }
      />

      <Card bodyClassName="flex flex-wrap items-center justify-between gap-4 p-4">
        <Switch
          label="Show archived"
          hint="Include suspended accounts"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        {!loading && (
          <p className="text-[13px] text-neutral-500">
            <span className="font-semibold text-neutral-900 tabular-nums">{users.length}</span>{' '}
            account{users.length === 1 ? '' : 's'}
          </p>
        )}
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={4} cols={5} />
        </Card>
      ) : users.length === 0 ? (
        <EmptyState
          icon="users"
          title="No staff accounts yet"
          description="Create an admin or data-feeder account to give a colleague access."
          action={
            <Button onClick={openCreate}>
              <Icon name="plus" size={16} />
              Create staff account
            </Button>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="38rem">
            <Table.Head>
              <Table.HeadCell>Email</Table.HeadCell>
              <Table.HeadCell>Role</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">Joined</Table.HeadCell>
              <Table.HeadCell align="right">
                <span className="sr-only">Actions</span>
              </Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <Table.Row key={u.id} className={u.archived ? 'bg-neutral-50/60' : undefined}>
                    <Table.Cell strong>
                      <span className="inline-flex items-center gap-2">
                        {u.email}
                        {isSelf && (
                          <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                            You
                          </span>
                        )}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant={u.role === 'admin' ? 'primary' : 'neutral'}>{u.role}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {u.archived ? (
                        <Badge variant="danger" dot>
                          Suspended
                        </Badge>
                      ) : (
                        <Badge variant="success" dot>
                          Active
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell align="right" muted>
                      {formatDate(u.createdAt)}
                    </Table.Cell>
                    <Table.Cell align="right">
                      {u.archived ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmTarget({ user: u, action: 'activate' })}
                        >
                          <Icon name="restore" size={13} />
                          Activate
                        </Button>
                      ) : (
                        // Suspending yourself is refused by the backend, so the control is hidden
                        // rather than offered and then rejected.
                        !isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmTarget({ user: u, action: 'suspend' })}
                          >
                            <Icon name="archive" size={13} />
                            Suspend
                          </Button>
                        )
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={createdCreds ? 'Account created' : 'Create staff account'}
        footer={
          createdCreds ? (
            <Button onClick={() => setCreateOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button loading={saving} onClick={handleCreate}>
                Create
              </Button>
            </>
          )
        }
      >
        {createdCreds ? (
          <div className="flex flex-col gap-3">
            <Alert variant="success">
              Account created. Share these credentials securely — the password won&apos;t be shown
              again.
            </Alert>
            {/* Deliberately plain text, not a masked field: this is the one and only time the
             * password is visible, and the admin has to be able to read and copy it. */}
            <dl className="surface-muted divide-y divide-neutral-200/70 rounded-lg text-sm">
              {[
                { label: 'Email', value: createdCreds.email, mono: true },
                { label: 'Password', value: createdCreds.password, mono: true },
                { label: 'Role', value: createdCreds.role, mono: false },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <dt className="text-[13px] text-neutral-500">{row.label}</dt>
                  <dd
                    className={cn(
                      'min-w-0 truncate font-medium text-neutral-900',
                      row.mono && 'font-mono text-[13px]'
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {formError && <Alert variant="danger">{formError}</Alert>}
            <Input
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              error={errors.email}
            />
            <PasswordInput
              label="Password"
              required
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              error={errors.password}
              hint={!errors.password ? 'At least 8 characters, with a letter and a number' : undefined}
            />
            <Select
              label="Role"
              required
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              options={ROLE_OPTIONS}
            />
            <p className="text-xs text-neutral-400">
              Created pre-verified, no OTP — the account can log in immediately with this password.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.action === 'suspend' ? 'Suspend staff account' : 'Activate staff account'}
        description={
          confirmTarget?.action === 'suspend'
            ? 'This immediately logs them out and blocks access. They can be reactivated later.'
            : 'This restores their access. They will need to log in again.'
        }
        confirmLabel={confirmTarget?.action === 'suspend' ? 'Suspend' : 'Activate'}
        confirmVariant={confirmTarget?.action === 'suspend' ? 'danger' : 'primary'}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}

export default StaffUsersPage;
