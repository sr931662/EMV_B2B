import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Modal, Spinner, useToast } from '../../components/ui';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';

function DestinationsTab({ onChanged }) {
  const [destinations, setDestinations] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/destinations?includeArchived=${includeArchived}`)
      .then((res) => setDestinations(res.destinations))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load destinations.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setNameError(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setName(d.name);
    setNameError(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/destinations/${editing.id}`, { name: name.trim() });
        showToast({ variant: 'success', message: 'Destination updated.' });
      } else {
        const res = await apiPost('/api/destinations', { name: name.trim() });
        showToast({ variant: 'success', message: res.message });
      }
      setModalOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (d) => {
    try {
      await apiDelete(`/api/destinations/${d.id}`);
      showToast({ variant: 'success', message: `${d.name} archived.` });
      await load();
      onChanged?.();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestore = async (d) => {
    try {
      await apiPost(`/api/destinations/${d.id}/restore`);
      showToast({ variant: 'success', message: `${d.name} restored.` });
      await load();
      onChanged?.();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Show archived
        </label>
        <Button size="sm" onClick={openCreate}>
          + New Destination
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : destinations.length === 0 ? (
        <Card bodyClassName="py-8 text-center">
          <p className="text-neutral-500">No destinations yet.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {destinations.map((d) => (
                <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-5 py-3 text-neutral-900">{d.name}</td>
                  <td className="px-5 py-3">
                    {d.archived ? (
                      <Badge variant="danger">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {!d.archived && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                          Edit
                        </Button>
                      )}
                      {d.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(d)}>
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(d)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit destination' : 'New destination'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSave}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        {formError && (
          <Alert variant="danger" className="mb-3">
            {formError}
          </Alert>
        )}
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
      </Modal>
    </div>
  );
}

export default DestinationsTab;
