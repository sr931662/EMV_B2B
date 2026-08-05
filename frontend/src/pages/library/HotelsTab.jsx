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
import RateCardEditor from '../../components/library/RateCardEditor';
import HotelVendorEditor from '../../components/library/HotelVendorEditor';
import RepeatableUrlList from '../../components/admin/RepeatableUrlList';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';

const PAGE_SIZE = 50;

/**
 * Hotels — master data, not booking data.
 *
 * A hotel row here is never sold directly: PackageHotel COPIES a hotel's details in at the moment
 * it is added to a package (locked rule 2), so a package a customer already holds is untouched by
 * anything edited on this screen. What lives here is purely the reusable source a package builder
 * picks FROM — same relationship as Destinations and Day Templates.
 *
 * Two things beyond name/category hang off a hotel and need their own editors, same reasoning as a
 * cancellation policy's bands: a hotel's substance is not a form.
 *   Rates      — HotelRate rows: what a room costs, by date range, occupancy, meal plan and
 *                supplier. RateCardEditor.
 *   Suppliers  — HotelVendor rows: which suppliers this room is bought through, and on what terms
 *                (allocation, release days, cancellation policy). HotelVendorEditor. A rate line
 *                can be pinned to one of these suppliers.
 */

const EMPTY_FORM = {
  name: '',
  category: '',
  starRating: '',
  description: '',
  roomType: '',
  mealPlan: '',
  images: [],
};

function HotelsTab() {
  const [countryId, setCountryId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [hotels, setHotels] = useState([]);
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

  // Which child editor is open for which hotel — null when neither is.
  const [ratesFor, setRatesFor] = useState(null);
  const [suppliersFor, setSuppliersFor] = useState(null);

  const load = () => {
    if (!destinationId) {
      setHotels([]);
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

    return apiGet(`/api/hotels?${params.toString()}`)
      .then((res) => {
        setHotels(res.hotels);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load hotels.'))
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

  const openEdit = (h) => {
    setEditing(h);
    setForm({
      name: h.name,
      category: h.category,
      starRating: h.starRating != null ? String(h.starRating) : '',
      description: h.description,
      roomType: h.roomType ?? '',
      mealPlan: h.mealPlan ?? '',
      images: h.images ?? [],
    });
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
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      starRating: form.starRating === '' ? null : Number(form.starRating),
      roomType: form.roomType.trim() || null,
      mealPlan: form.mealPlan.trim() || null,
      images,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/hotels/${editing.id}`, payload);
        showToast({ variant: 'success', message: 'Hotel updated.' });
      } else {
        await apiPost('/api/hotels', { ...payload, destinationId });
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LibraryPicker
            entity="country"
            label="Country"
            value={countryId}
            onChange={(next) => {
              setCountryId(next);
              // A destination from the previous country would still be in effect and would
              // silently list the wrong hotels — clearing it is the only correct move here.
              setDestinationId('');
            }}
            placeholder="Search countries…"
            allowCreate={false}
          />
          <LibraryPicker
            entity="destination"
            label="Destination"
            value={destinationId}
            onChange={setDestinationId}
            scopeId={countryId || undefined}
            placeholder={countryId ? 'Search destinations…' : 'Pick a country first'}
            disabled={!countryId}
            allowCreate={false}
          />
        </div>
      </Card>

      {!destinationId ? (
        <EmptyState
          icon="building"
          title="Pick a destination"
          description="Hotels are master data scoped to a destination — never to a package or a quote. Pick one above to see what is on file, independent of anything built from it."
        />
      ) : (
        <>
          <Card bodyClassName="flex flex-wrap items-center justify-between gap-3 p-4">
            <Switch
              label="Show archived"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <Button size="sm" onClick={openCreate}>
              <Icon name="plus" size={14} />
              New hotel
            </Button>
          </Card>

          {error && <Alert variant="danger">{error}</Alert>}

          {loading ? (
            <Card bodyClassName="p-5">
              <Skeleton.Rows rows={4} cols={5} />
            </Card>
          ) : hotels.length === 0 ? (
            <EmptyState
              icon="building"
              title="No hotels yet"
              description="Add the properties for this destination so packages can bundle accommodation. Each one stays reusable — packages copy its details in rather than referencing it."
              action={
                <Button onClick={openCreate}>
                  <Icon name="plus" size={16} />
                  New hotel
                </Button>
              }
            />
          ) : (
            <Card bodyClassName="p-0">
              <Table minWidth="52rem">
                <Table.Head>
                  <Table.HeadCell>Name</Table.HeadCell>
                  <Table.HeadCell>Category</Table.HeadCell>
                  <Table.HeadCell align="right">Star rating</Table.HeadCell>
                  <Table.HeadCell>Room / meal plan</Table.HeadCell>
                  <Table.HeadCell>Status</Table.HeadCell>
                  <Table.HeadCell align="right">
                    <span className="sr-only">Actions</span>
                  </Table.HeadCell>
                </Table.Head>
                <Table.Body>
                  {hotels.map((h) => (
                    <Table.Row key={h.id} className={h.archived ? 'bg-neutral-50/60' : undefined}>
                      <Table.Cell strong>
                        {h.name}
                        {h.images?.length > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-normal text-neutral-400">
                            <Icon name="file" size={11} />
                            {h.images.length}
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>{h.category}</Table.Cell>
                      <Table.Cell align="right" className="tabular-nums">
                        {h.starRating ?? '—'}
                      </Table.Cell>
                      <Table.Cell>
                        {[h.roomType, h.mealPlan].filter(Boolean).join(' · ') || '—'}
                      </Table.Cell>
                      <Table.Cell>
                        {h.archived ? (
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
                          <Button variant="outline" size="sm" onClick={() => setRatesFor(h)}>
                            Rates
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setSuppliersFor(h)}>
                            Suppliers
                          </Button>
                          {!h.archived && (
                            <Button variant="outline" size="sm" onClick={() => openEdit(h)}>
                              <Icon name="pencil" size={13} />
                              Edit
                            </Button>
                          )}
                          {h.archived ? (
                            <Button variant="outline" size="sm" onClick={() => handleRestore(h)}>
                              <Icon name="restore" size={13} />
                              Restore
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleArchive(h)}>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Category"
              required
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              error={errors.category}
              hint={!errors.category ? 'e.g. 5-star, Boutique, Budget' : undefined}
            />
            <Input
              label="Star rating"
              type="number"
              min="1"
              max="7"
              value={form.starRating}
              onChange={(e) => setForm((prev) => ({ ...prev, starRating: e.target.value }))}
            />
          </div>
          <Textarea
            label="Description"
            required
            rows={4}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            error={errors.description}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Default room type"
              value={form.roomType}
              onChange={(e) => setForm((prev) => ({ ...prev, roomType: e.target.value }))}
              hint="What a package starts from when it copies this hotel in."
            />
            <Input
              label="Default meal plan"
              value={form.mealPlan}
              onChange={(e) => setForm((prev) => ({ ...prev, mealPlan: e.target.value }))}
            />
          </div>
          <RepeatableUrlList
            purpose="packageHotel"
            label="Images"
            values={form.images}
            onChange={(images) => setForm((prev) => ({ ...prev, images }))}
          />
        </div>
      </Modal>

      <Modal open={Boolean(ratesFor)} onClose={() => setRatesFor(null)} title={`Rate card — ${ratesFor?.name ?? ''}`} size="lg">
        {ratesFor && <RateCardEditor hotelId={ratesFor.id} onClose={() => setRatesFor(null)} />}
      </Modal>

      <Modal
        open={Boolean(suppliersFor)}
        onClose={() => setSuppliersFor(null)}
        title={`Suppliers — ${suppliersFor?.name ?? ''}`}
        size="lg"
      >
        {suppliersFor && <HotelVendorEditor hotelId={suppliersFor.id} onClose={() => setSuppliersFor(null)} />}
      </Modal>
    </div>
  );
}

export default HotelsTab;
