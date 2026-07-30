import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner, Textarea, useToast } from '../../components/ui';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';

const EMPTY_FORM = { title: '', description: '' };

function DayTemplatesTab() {
  const [destinations, setDestinations] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet('/api/destinations').then((res) => setDestinations(res.destinations)).catch(() => {});
  }, []);

  const load = () => {
    if (!destinationId) {
      setTemplates([]);
      return undefined;
    }
    setLoading(true);
    setError(null);
    return apiGet(`/api/day-templates?destinationId=${destinationId}&includeArchived=${includeArchived}`)
      .then((res) => setTemplates(res.dayTemplates))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load day templates.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, includeArchived]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ title: t.title, description: t.description });
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = 'Required';
    if (!form.description.trim()) nextErrors.description = 'Required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/day-templates/${editing.id}`, {
          title: form.title.trim(),
          description: form.description.trim(),
        });
        showToast({ variant: 'success', message: 'Day template updated.' });
      } else {
        await apiPost('/api/day-templates', {
          destinationId,
          title: form.title.trim(),
          description: form.description.trim(),
        });
        showToast({ variant: 'success', message: 'Day template created.' });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (t) => {
    try {
      await apiDelete(`/api/day-templates/${t.id}`);
      showToast({ variant: 'success', message: `"${t.title}" archived.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestore = async (t) => {
    try {
      await apiPost(`/api/day-templates/${t.id}/restore`);
      showToast({ variant: 'success', message: `"${t.title}" restored.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:w-1/2">
          <Select
            label="Destination"
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            options={[
              { value: '', label: 'Select a destination...' },
              ...destinations.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
      </Card>

      {!destinationId ? (
        <Card bodyClassName="py-8 text-center">
          <p className="text-neutral-500">Pick a destination to manage its day templates.</p>
        </Card>
      ) : (
        <>
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
              + New Day Template
            </Button>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : templates.length === 0 ? (
            <Card bodyClassName="py-8 text-center">
              <p className="text-neutral-500">No day templates for this destination yet.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((t) => (
                <Card key={t.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-neutral-900">{t.title}</h3>
                        {t.archived && <Badge variant="danger">Archived</Badge>}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">{t.description}</p>
                    </div>
                    <div className="flex flex-none gap-2">
                      {!t.archived && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                          Edit
                        </Button>
                      )}
                      {t.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(t)}>
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(t)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit day template' : 'New day template'}
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
        <div className="flex flex-col gap-4">
          <Input
            label="Title"
            required
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            error={errors.title}
          />
          <Textarea
            label="Description"
            required
            rows={5}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            error={errors.description}
          />
        </div>
      </Modal>
    </div>
  );
}

export default DayTemplatesTab;
