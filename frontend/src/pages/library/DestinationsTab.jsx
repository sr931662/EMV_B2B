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
  Skeleton,
  Switch,
  Table,
  Textarea,
  useToast,
} from '../../components/ui';
import LibraryPicker from '../../components/library/LibraryPicker';
import BulkImportExport from '../../components/library/BulkImportExport';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';

const PAGE_SIZE = 50;

const BLANK_FORM = {
  name: '',
  countryId: '',
  city: '',
  state: '',
  aboutDestination: '',
  packages: '',
  faqs: '',
};

function DestinationsTab({ onChanged }) {
  const [destinations, setDestinations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  // Phase 3: destinations now sit inside countries, so the list can be narrowed to one.
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Adding a country's cities one modal at a time is what made this a request in the first place —
  // a new destination usually means "we just signed the contract for this country," which is
  // several cities at once, not one.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCountryId, setBulkCountryId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      includeArchived: String(includeArchived),
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (countryFilter) params.set('countryId', countryFilter);

    return apiGet(`/api/destinations?${params.toString()}`)
      .then((res) => {
        setDestinations(res.destinations);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load destinations.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setPage(1);
  }, [includeArchived, countryFilter]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived, countryFilter, page]);

  const openCreate = () => {
    setEditing(null);
    // The country filter doubles as the default for a new destination: someone who has just
    // narrowed the list to Thailand is almost certainly adding a Thai city.
    setForm({ ...BLANK_FORM, countryId: countryFilter });
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({
      name: d.name ?? '',
      countryId: d.countryId ?? '',
      city: d.city ?? '',
      state: d.state ?? '',
      aboutDestination: d.aboutDestination ?? '',
      packages: d.packages ?? '',
      faqs: d.faqs ?? '',
    });
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Required';
    if (!form.countryId) nextErrors.countryId = 'Pick the country this destination is in';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        countryId: form.countryId,
        aboutDestination: form.aboutDestination.trim(),
        packages: form.packages.trim(),
        faqs: form.faqs.trim(),
      };

      // The API rejects an empty string on these, so send them only when they hold something.
      if (form.city.trim()) payload.city = form.city.trim();
      if (form.state.trim()) payload.state = form.state.trim();
      if (editing) {
        await apiPatch(`/api/destinations/${editing.id}`, payload);
        showToast({ variant: 'success', message: 'Destination updated.' });
      } else {
        const res = await apiPost('/api/destinations', payload);
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

  const openBulk = () => {
    setBulkCountryId(countryFilter);
    setBulkText('');
    setBulkError(null);
    setBulkResults(null);
    setBulkOpen(true);
  };

  /**
   * Creates every non-blank line as its own destination under the chosen country.
   *
   * Sequential, not Promise.all: a country can have dozens of cities pasted in at once, and firing
   * them all in parallel would be a burst of writes against the same country row with no way to
   * tell a partial failure apart from a full one. One request at a time is slower but the per-line
   * result below is honest about what actually saved.
   */
  const handleBulkSave = async () => {
    const names = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!bulkCountryId) {
      setBulkError('Pick the country these destinations belong to.');
      return;
    }
    if (names.length === 0) {
      setBulkError('Enter at least one destination name, one per line.');
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    setBulkResults(null);

    const results = [];
    for (const name of names) {
      try {
        await apiPost('/api/destinations', {
          name,
          countryId: bulkCountryId,
          aboutDestination: '',
          packages: '',
          faqs: '',
        });
        results.push({ name, ok: true });
      } catch (err) {
        results.push({ name, ok: false, message: err instanceof ApiError ? err.message : 'Failed to create.' });
      }
    }

    setBulkResults(results);
    setBulkSaving(false);

    const created = results.filter((r) => r.ok).length;
    if (created > 0) {
      showToast({
        variant: created === results.length ? 'success' : 'warning',
        message: `${created} of ${results.length} destination${results.length === 1 ? '' : 's'} created.`,
      });
      await load();
      onChanged?.();
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
      <Card bodyClassName="flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <LibraryPicker
              entity="country"
              label="Country"
              value={countryFilter}
              onChange={setCountryFilter}
              placeholder="All countries"
              // Filtering is not the moment to be adding master data — the shell is.
              allowCreate={false}
            />
          </div>
          <div className="pb-2.5">
            <Switch
              label="Show archived"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
          </div>
        </div>
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <BulkImportExport
            label="Destinations"
            exportUrl="/api/destinations/export"
            importUrl="/api/destinations/import"
            extraParams={countryFilter ? { countryId: countryFilter } : undefined}
            onImported={load}
          />
          <Button size="sm" variant="outline" onClick={openBulk}>
            <Icon name="plus" size={14} />
            Bulk add destinations
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Icon name="plus" size={14} />
            New destination
          </Button>
        </div>
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
          <Table minWidth="38rem">
            <Table.Head>
              <Table.HeadCell>Name</Table.HeadCell>
              <Table.HeadCell>Country</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">
                <span className="sr-only">Actions</span>
              </Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {destinations.map((d) => (
                <Table.Row key={d.id} className={d.archived ? 'bg-neutral-50/60' : undefined}>
                  <Table.Cell strong>
                    {d.name}
                    {(d.city || d.state) && (
                      <span className="block text-[12px] font-normal text-neutral-500">
                        {[d.city, d.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {d.country ? (
                      <span className="inline-flex items-center gap-1.5">
                        {d.country.flagImageUrl && (
                          <img
                            src={d.country.flagImageUrl}
                            alt=""
                            aria-hidden="true"
                            className="h-3.5 w-5 rounded-sm object-cover"
                          />
                        )}
                        {d.country.name}
                      </span>
                    ) : (
                      // Should not occur — the API sets a country on every write — but a row that
                      // slipped through must be visible rather than blank, or it never gets fixed.
                      <Badge variant="warning" dot>
                        Not set
                      </Badge>
                    )}
                  </Table.Cell>
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
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
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
        <div className="mt-4 grid gap-4">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            error={errors.name}
          />
          <LibraryPicker
            entity="country"
            label="Country"
            value={form.countryId}
            onChange={(countryId) => setForm((prev) => ({ ...prev, countryId }))}
            placeholder="Search countries…"
            hint="Visa rules, embassy details and travel notes are maintained once on the country and reused by every destination inside it."
            error={errors.countryId}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="City"
              value={form.city}
              onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              hint="Optional — set it when the destination name is not the city itself."
            />
            <Input
              label="State / region"
              value={form.state}
              onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
            />
          </div>
          <Textarea
            label="About Destination"
            rows={6}
            value={form.aboutDestination}
            onChange={(e) => setForm((prev) => ({ ...prev, aboutDestination: e.target.value }))}
            hint="Markdown supported, including **bold**, bullet lists and numbered lists."
          />
          <Textarea
            label="Packages"
            rows={6}
            value={form.packages}
            onChange={(e) => setForm((prev) => ({ ...prev, packages: e.target.value }))}
            hint="Paste destination package highlights or selling points in markdown."
          />
          <Textarea
            label="FAQs"
            rows={6}
            value={form.faqs}
            onChange={(e) => setForm((prev) => ({ ...prev, faqs: e.target.value }))}
            hint="Keep FAQ content in markdown so it renders cleanly on the itinerary page."
          />
        </div>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk add destinations"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Close
            </Button>
            <Button loading={bulkSaving} onClick={handleBulkSave}>
              Create all
            </Button>
          </>
        }
      >
        {bulkError && (
          <Alert variant="danger" className="mb-3">
            {bulkError}
          </Alert>
        )}
        <div className="mt-4 flex flex-col gap-4">
          <LibraryPicker
            entity="country"
            label="Country"
            value={bulkCountryId}
            onChange={setBulkCountryId}
            placeholder="Search countries…"
            allowCreate={false}
          />
          <Textarea
            label="Destination names"
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            hint="One destination per line, e.g. one city per row. Each is created with this country and no other details — edit a row afterwards to add city, state, about text and FAQs."
          />
          {bulkResults && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-200 p-2 text-[13px]">
              {bulkResults.map((r, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i} className={r.ok ? 'text-success-700' : 'text-danger-700'}>
                  {r.ok ? '✓' : '✕'} {r.name}
                  {!r.ok && r.message ? ` — ${r.message}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default DestinationsTab;
