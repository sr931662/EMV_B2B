import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner, useToast } from '../../components/ui';
import ConfirmModal from '../../components/admin/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { formatDate } from '../../lib/format';
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Staff Users</h1>
        <Button onClick={openCreate}>+ Create Staff Account</Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        Show archived
      </label>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : users.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">No staff accounts yet.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">
                      {u.email} {isSelf && <span className="text-xs text-neutral-400">(you)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{u.role}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {u.archived ? (
                        <Badge variant="danger">Suspended</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutral-500">{formatDate(u.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {u.archived ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmTarget({ user: u, action: 'activate' })}
                        >
                          Activate
                        </Button>
                      ) : (
                        !isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmTarget({ user: u, action: 'suspend' })}
                          >
                            Suspend
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            <div className="rounded-lg border border-neutral-200 p-4 text-sm">
              <p>
                <span className="text-neutral-500">Email:</span>{' '}
                <span className="font-mono font-medium text-neutral-900">{createdCreds.email}</span>
              </p>
              <p className="mt-1">
                <span className="text-neutral-500">Password:</span>{' '}
                <span className="font-mono font-medium text-neutral-900">{createdCreds.password}</span>
              </p>
              <p className="mt-1">
                <span className="text-neutral-500">Role:</span>{' '}
                <span className="font-medium text-neutral-900">{createdCreds.role}</span>
              </p>
            </div>
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
            <Input
              label="Password"
              type="password"
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
