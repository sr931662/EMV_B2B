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
  Skeleton,
  Switch,
  Table,
  useToast,
} from '../../components/ui';
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
      <Card bodyClassName="flex flex-wrap items-center justify-between gap-3 p-4">
        <Switch
          label="Show archived"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" size={14} />
          New destination
        </Button>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={4} cols={3} />
        </Card>
      ) : destinations.length === 0 ? (
        <EmptyState
          icon="map-pin"
          title="No destinations yet"
          description="Destinations are the top of the hierarchy — day templates, hotels and packages all hang off one."
          action={
            <Button onClick={openCreate}>
              <Icon name="plus" size={16} />
              New destination
            </Button>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="30rem">
            <Table.Head>
              <Table.HeadCell>Name</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">
                <span className="sr-only">Actions</span>
              </Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {destinations.map((d) => (
                <Table.Row key={d.id} className={d.archived ? 'bg-neutral-50/60' : undefined}>
                  <Table.Cell strong>{d.name}</Table.Cell>
                  <Table.Cell>
                    {d.archived ? (
                      <Badge variant="neutral" dot>
                        Archived
                      </Badge>
                    ) : (
                      <Badge variant="success" dot>
                        Active
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell align="right">
                    <div className="flex justify-end gap-2">
                      {!d.archived && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                          <Icon name="pencil" size={13} />
                          Edit
                        </Button>
                      )}
                      {d.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(d)}>
                          <Icon name="restore" size={13} />
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(d)}>
                          <Icon name="archive" size={13} />
                          Archive
                        </Button>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
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
