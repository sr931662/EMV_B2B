import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner, Textarea, useToast } from '../../components/ui';
import RepeatableUrlList from '../../components/admin/RepeatableUrlList';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';

const EMPTY_FORM = { name: '', category: '', description: '', images: [] };

function HotelsTab() {
  const [destinations, setDestinations] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [hotels, setHotels] = useState([]);
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
      setHotels([]);
      return undefined;
    }
    setLoading(true);
    setError(null);
    return apiGet(`/api/hotels?destinationId=${destinationId}&includeArchived=${includeArchived}`)
      .then((res) => setHotels(res.hotels))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load hotels.'))
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

  const openEdit = (h) => {
    setEditing(h);
    setForm({ name: h.name, category: h.category, description: h.description, images: h.images ?? [] });
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Required';
    if (!form.category.trim()) nextErrors.category = 'Required';
    if (!form.description.trim()) nextErrors.description = 'Required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const images = form.images.map((i) => i.trim()).filter(Boolean);

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/hotels/${editing.id}`, {
          name: form.name.trim(),
          category: form.category.trim(),
          description: form.description.trim(),
          images,
        });
        showToast({ variant: 'success', message: 'Hotel updated.' });
      } else {
        await apiPost('/api/hotels', {
          destinationId,
          name: form.name.trim(),
          category: form.category.trim(),
          description: form.description.trim(),
          images,
        });
        showToast({ variant: 'success', message: 'Hotel created.' });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (h) => {
    try {
      await apiDelete(`/api/hotels/${h.id}`);
      showToast({ variant: 'success', message: `"${h.name}" archived.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestore = async (h) => {
    try {
      await apiPost(`/api/hotels/${h.id}/restore`);
      showToast({ variant: 'success', message: `"${h.name}" restored.` });
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
          <p className="text-neutral-500">Pick a destination to manage its hotels.</p>
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
              + New Hotel
            </Button>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : hotels.length === 0 ? (
            <Card bodyClassName="py-8 text-center">
              <p className="text-neutral-500">No hotels for this destination yet.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {hotels.map((h) => (
                <Card key={h.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-neutral-900">{h.name}</h3>
                        <Badge variant="info">{h.category}</Badge>
                        {h.archived && <Badge variant="danger">Archived</Badge>}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">{h.description}</p>
                      {h.images?.length > 0 && (
                        <p className="mt-1 text-xs text-neutral-400">{h.images.length} image(s)</p>
                      )}
                    </div>
                    <div className="flex flex-none gap-2">
                      {!h.archived && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(h)}>
                          Edit
                        </Button>
                      )}
                      {h.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(h)}>
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(h)}>
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
        title={editing ? 'Edit hotel' : 'New hotel'}
        size="lg"
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
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            error={errors.name}
          />
          <Input
            label="Category"
            required
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            error={errors.category}
            hint={!errors.category ? 'e.g. 5-star, Boutique, Budget' : undefined}
          />
          <Textarea
            label="Description"
            required
            rows={4}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            error={errors.description}
          />
          <RepeatableUrlList
            label="Images"
            values={form.images}
            onChange={(images) => setForm((prev) => ({ ...prev, images }))}
          />
        </div>
      </Modal>
    </div>
  );
}

export default HotelsTab;
