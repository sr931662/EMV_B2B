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
  Pagination,
  Select,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '../../components/ui';
import BulkImportExport from '../../components/library/BulkImportExport';
import DayTemplateEventEditor from '../../components/library/DayTemplateEventEditor';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';
import { PICKER_FULL_LIST_LIMIT } from '../../lib/constants';

const PAGE_SIZE = 50;
const EMPTY_FORM = { title: '', description: '' };

function DayTemplatesTab() {
  const [destinations, setDestinations] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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

  // Which template's day-by-day events are open for editing — null when none is.
  const [eventsFor, setEventsFor] = useState(null);

  useEffect(() => {
    // This is a filter dropdown, not a browse list — it needs every destination that exists, so
    // it asks for the app's practical ceiling rather than a paged default.
    apiGet(`/api/destinations?limit=${PICKER_FULL_LIST_LIMIT}`)
      .then((res) => setDestinations(res.destinations))
      .catch(() => {});
  }, []);

  const load = () => {
    if (!destinationId) {
      setTemplates([]);
      return undefined;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      destinationId,
      includeArchived: String(includeArchived),
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });

    return apiGet(`/api/day-templates?${params.toString()}`)
      .then((res) => {
        setTemplates(res.dayTemplates);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load day templates.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setPage(1);
  }, [destinationId, includeArchived]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, includeArchived, page]);

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
        <EmptyState
          icon="map-pin"
          title="Pick a destination"
          description="Day templates belong to a destination. Choose one above to manage its itinerary days."
        />
      ) : (
        <>
          <Card bodyClassName="flex flex-wrap items-center justify-between gap-3 p-4">
            <Switch
              label="Show archived"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <BulkImportExport
                label="Day templates"
                exportUrl="/api/day-templates/export"
                importUrl="/api/day-templates/import"
                extraParams={{ destinationId }}
                extraFields={{ destinationId }}
                onImported={load}
              />
              <Button size="sm" onClick={openCreate}>
                <Icon name="plus" size={14} />
                New day template
              </Button>
            </div>
          </Card>

          {error && <Alert variant="danger">{error}</Alert>}

          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Card key={i}>
                  <Skeleton.Text lines={2} />
                </Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No day templates yet"
              description="Write each day of the itinerary once here, then a package composes its days by picking from this list."
              action={
                <Button onClick={openCreate}>
                  <Icon name="plus" size={16} />
                  New day template
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((t) => (
                <Card key={t.id} className={t.archived ? 'opacity-75' : undefined}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-neutral-900">{t.title}</h3>
                        {t.archived && (
                          <Badge variant="neutral" dot>
                            Archived
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                        {t.description}
                      </p>
                    </div>
                    <div className="flex flex-none gap-2">
                      {!t.archived && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEventsFor(t)}>
                            <Icon name="calendar" size={13} />
                            Itinerary
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                            <Icon name="pencil" size={13} />
                            Edit
                          </Button>
                        </>
                      )}
                      {t.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(t)}>
                          <Icon name="restore" size={13} />
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(t)}>
                          <Icon name="archive" size={13} />
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              <Card bodyClassName="p-0">
                <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
              </Card>
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

      <Modal
        open={Boolean(eventsFor)}
        onClose={() => setEventsFor(null)}
        title={`Itinerary — ${eventsFor?.title ?? ''}`}
        size="xl"
      >
        {eventsFor && (
          <DayTemplateEventEditor
            dayTemplateId={eventsFor.id}
            destinationId={destinationId}
            onClose={() => setEventsFor(null)}
          />
        )}
      </Modal>
    </div>
  );
}

export default DayTemplatesTab;
