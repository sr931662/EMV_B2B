import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '../../components/ui';
import ChipInput from '../../components/admin/ChipInput';
import RepeatableUrlList from '../../components/admin/RepeatableUrlList';
import DayTemplatePicker from '../../components/admin/DayTemplatePicker';
import HotelPicker from '../../components/admin/HotelPicker';
import LibraryPicker from '../../components/library/LibraryPicker';
import { apiGet, apiPost, apiPatch, apiDownload, ApiError } from '../../api/client';
import { slugify } from '../../lib/format';

const TAG_SUGGESTIONS = ['Family', 'Honeymoon', 'Luxury', 'Adventure', 'Budget', 'Beach', 'Romantic', 'Group'];

const EMPTY_FORM = { title: '', days: '', nights: '', rawPrice: '', inclusions: '', exclusions: '' };

/**
 * Turns chosen vocabulary items into the prose the package stores.
 *
 * Composing rather than referencing is deliberate, and it is the whole shape of how the library
 * meets a package. `Package.inclusions` is what a customer reads on a quote, so it must be FROZEN
 * text — rule 2. What the picker adds is that the text is now assembled from named items instead of
 * typed from memory, so the same inclusion reads identically across every package, and the links
 * recorded alongside make "which packages include airport transfers" a query.
 *
 * Existing free-typed lines are preserved: someone editing an old package must not lose what they
 * wrote because they touched the picker.
 */
function composeLines(existingText, items) {
  const fromLibrary = items.map((item) => item.label ?? item.name).filter(Boolean);
  const manual = String(existingText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !fromLibrary.includes(line));

  return [...fromLibrary, ...manual].join('\n');
}

/**
 * What the selected hotels actually cost, from their rate cards.
 *
 * The payoff of Phase 5, and the reason rate cards were worth building. `rawPrice` has always been a
 * number someone typed from a spreadsheet open in another window; this prices the same hotels
 * through the same resolver a quote uses, so the two cannot disagree.
 *
 * Deliberately an ESTIMATE and not an auto-fill. A package price includes transfers, activities,
 * margin and rounding that no rate card knows about, so writing it into the field would be
 * confidently wrong. It is shown next to the field instead, and the human decides.
 */
function CostFromRates({ hotelIds, nights, estimate, onEstimate }) {
  const [checkIn, setCheckIn] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const start = new Date(checkIn);
      const results = await Promise.all(
        hotelIds.map((hotelId) => {
          // Each hotel is priced for the whole stay. Splitting nights between them needs the
          // itinerary's stay chaining, which lives on the voucher — this is a sanity check, not a
          // costing engine, and pretending otherwise would make it wrong in a subtler way.
          const out = new Date(start);
          out.setUTCDate(out.getUTCDate() + Math.max(Number(nights) || 1, 1));

          const params = new URLSearchParams({
            checkIn: start.toISOString().slice(0, 10),
            checkOut: out.toISOString().slice(0, 10),
            occupancy: 'DOUBLE',
          });

          return apiGet(`/api/rates/hotels/${hotelId}/price?${params.toString()}`).catch((err) => ({
            priced: false,
            reason: err instanceof ApiError ? err.message : 'Could not price.',
          }));
        })
      );

      onEstimate(results);
    } finally {
      setBusy(false);
    }
  };

  if (hotelIds.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
        Check against rate cards
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Sample check-in"
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          hint="Rates are seasonal, so a cost only means something against a date."
        />
        <Button size="sm" variant="outline" loading={busy} disabled={!checkIn} onClick={run}>
          What do these hotels cost?
        </Button>
      </div>

      {estimate && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-neutral-200 pt-3 text-[13px]">
          {estimate.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-neutral-900">{r.hotel?.name ?? `Hotel ${i + 1}`}</span>
              {r.priced ? (
                <span className="tabular-nums text-neutral-700">
                  {r.currencyCode} {r.total}{' '}
                  <span className="text-neutral-500">for {r.nights} night(s)</span>
                </span>
              ) : (
                <span className="text-danger-700">{r.reason}</span>
              )}
            </li>
          ))}
          <li className="mt-1 text-[12px] text-neutral-500">
            Hotels only. Transfers, activities and margin are not in these numbers, so this is a
            check on the accommodation cost — not the package price.
          </li>
        </ul>
      )}
    </div>
  );
}

function PackageFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [pkgMeta, setPkgMeta] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Phase 6: the geography is a hierarchy now, so the destination picker is narrowed by country
  // rather than listing every destination the business has ever sold.
  const [countryId, setCountryId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [dayTemplates, setDayTemplates] = useState([]);
  const [hotels, setHotels] = useState([]);

  // What the package draws from the library.
  const [cancellationPolicyId, setCancellationPolicyId] = useState('');
  const [faqIds, setFaqIds] = useState([]);
  const [inclusionIds, setInclusionIds] = useState([]);
  const [exclusionIds, setExclusionIds] = useState([]);
  const [rateEstimate, setRateEstimate] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [gallery, setGallery] = useState(['']);
  const [tags, setTags] = useState([]);

  const [itinerary, setItinerary] = useState([]);
  const [itineraryTouched, setItineraryTouched] = useState(!isEdit);
  const [currentDays, setCurrentDays] = useState([]);

  const [selectedHotels, setSelectedHotels] = useState([]);
  const [hotelsTouched, setHotelsTouched] = useState(!isEdit);
  const [currentHotels, setCurrentHotels] = useState([]);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(null);
    apiGet(`/api/packages/${id}`)
      .then((res) => {
        const pkg = res.package;
        setPkgMeta(pkg);
        setDestinationId(pkg.destination.id);
        setCancellationPolicyId(pkg.cancellationPolicyId ?? '');
        // Re-open showing what was chosen. A form that forgets its own selections on reload is how
        // people conclude the picker "does not save" and go back to typing.
        setFaqIds((pkg.library?.faqs ?? []).map((f) => f.id));
        setInclusionIds((pkg.library?.inclusionItems ?? []).map((i) => i.id));
        setExclusionIds((pkg.library?.exclusionItems ?? []).map((i) => i.id));
        setForm({
          title: pkg.title,
          days: String(pkg.days),
          nights: String(pkg.nights),
          rawPrice: String(pkg.rawPrice),
          inclusions: pkg.inclusions,
          exclusions: pkg.exclusions,
        });
        setGallery(pkg.gallery.length ? pkg.gallery : ['']);
        setTags(pkg.tags);
        setCurrentDays([...pkg.packageDays].sort((a, b) => a.dayNumber - b.dayNumber));
        setCurrentHotels([...pkg.packageHotels].sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load package.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(() => {
    if (!destinationId) {
      setDayTemplates([]);
      setHotels([]);
      return;
    }
    apiGet(`/api/day-templates?destinationId=${destinationId}`)
      .then((res) => setDayTemplates(res.dayTemplates))
      .catch(() => {});
    apiGet(`/api/hotels?destinationId=${destinationId}`)
      .then((res) => setHotels(res.hotels))
      .catch(() => {});
  }, [destinationId]);

  const addDay = (templateId) => {
    setItinerary((prev) => [...prev, { key: crypto.randomUUID(), templateId }]);
    setItineraryTouched(true);
  };
  const removeDay = (key) => {
    setItinerary((prev) => prev.filter((d) => d.key !== key));
    setItineraryTouched(true);
  };
  const moveDay = (index, dir) => {
    setItinerary((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setItineraryTouched(true);
  };

  const addHotel = (hotelId) => {
    setSelectedHotels((prev) => [...prev, { key: crypto.randomUUID(), hotelId }]);
    setHotelsTouched(true);
  };
  const removeHotel = (key) => {
    setSelectedHotels((prev) => prev.filter((h) => h.key !== key));
    setHotelsTouched(true);
  };
  const moveHotel = (index, dir) => {
    setSelectedHotels((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setHotelsTouched(true);
  };

  const validate = () => {
    const e = {};
    if (!destinationId) e.destinationId = 'Required';
    if (!form.title.trim()) e.title = 'Required';
    if (!form.days || Number(form.days) < 1) e.days = 'Required, at least 1';
    if (form.nights === '' || Number(form.nights) < 0) e.nights = 'Required, 0 or more';
    if (form.rawPrice === '' || Number(form.rawPrice) < 0) e.rawPrice = 'Required, 0 or more';
    if (!form.inclusions.trim()) e.inclusions = 'Required';
    if (!form.exclusions.trim()) e.exclusions = 'Required';

    if (itineraryTouched) {
      if (itinerary.length === 0) e.itinerary = 'Select at least one day template.';
      else if (Number(form.days) !== itinerary.length) {
        e.itinerary = `The "Days" field (${form.days}) must match the number of itinerary days selected (${itinerary.length}).`;
      }
    }

    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const galleryClean = gallery.map((g) => g.trim()).filter(Boolean);

    const payload = {
      title: form.title.trim(),
      days: Number(form.days),
      nights: Number(form.nights),
      rawPrice: Number(form.rawPrice),
      inclusions: form.inclusions.trim(),
      exclusions: form.exclusions.trim(),
      gallery: galleryClean,
      tags,
    };

    // Library links go on both create and update. Unlike the itinerary these are not "replace the
    // whole thing" edits with consequences — they are what the package is tagged with.
    payload.cancellationPolicyId = cancellationPolicyId || null;
    payload.faqIds = faqIds;
    payload.inclusionIds = inclusionIds;
    payload.exclusionIds = exclusionIds;

    if (!isEdit) {
      payload.destinationId = destinationId;
      payload.dayTemplateIds = itinerary.map((d) => d.templateId);
      payload.hotelIds = selectedHotels.map((h) => h.hotelId);
    } else {
      if (itineraryTouched) payload.dayTemplateIds = itinerary.map((d) => d.templateId);
      if (hotelsTouched) payload.hotelIds = selectedHotels.map((h) => h.hotelId);
    }

    setSubmitting(true);
    try {
      const res = isEdit
        ? await apiPatch(`/api/packages/${id}`, payload)
        : await apiPost('/api/packages', payload);
      showToast({ variant: 'success', message: res.message });
      navigate(`/admin/packages/${res.package.id}/edit`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const fieldErrors = {};
          err.details.forEach((d) => {
            fieldErrors[d.field] = d.message;
          });
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
        }
        setFormError(err.message);
      } else {
        setFormError('Network error. Please check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadEmvQuote = async () => {
    setDownloading(true);
    try {
      await apiDownload(`/api/packages/${id}/emv-quote.pdf`, {
        filename: `emv-quote-${slugify(pkgMeta.title)}.pdf`,
      });
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not download the PDF.',
      });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return <Alert variant="danger">{loadError}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/packages" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to packages
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
          {isEdit ? 'Edit Package' : 'Create Package'}
        </h1>
        {isEdit && (
          <Button variant="outline" loading={downloading} onClick={handleDownloadEmvQuote}>
            Download TravNexa Quote (PDF)
          </Button>
        )}
      </div>

      <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Card title="Destination">
          {isEdit ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-[14px] font-medium text-neutral-900">{pkgMeta?.destination?.name}</p>
              <p className="mt-0.5 text-[13px] text-neutral-500">
                A package can’t move destinations once created — its copied days and hotels were
                validated against this one.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LibraryPicker
                entity="country"
                label="Country"
                value={countryId}
                onChange={(next) => {
                  setCountryId(next);
                  // Clearing the destination is not tidiness — a destination from the previous
                  // country would still be submitted and would silently sell the wrong place.
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
                error={errors.destinationId}
                allowCreate={false}
              />
            </div>
          )}
        </Card>

        <Card title="Package details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4">
              <Input
                label="Title"
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                error={errors.title}
                hint={!errors.title ? 'Cannot contain "EMV" or "TravNexa" branding — leaks into white-label PDFs' : undefined}
              />
            </div>
            <Input
              label="Days"
              type="number"
              min="1"
              required
              value={form.days}
              onChange={(e) => setForm((prev) => ({ ...prev, days: e.target.value }))}
              error={errors.days}
            />
            <Input
              label="Nights"
              type="number"
              min="0"
              required
              value={form.nights}
              onChange={(e) => setForm((prev) => ({ ...prev, nights: e.target.value }))}
              error={errors.nights}
            />
            <Input
              label="TravNexa Cost (raw price)"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.rawPrice}
              onChange={(e) => setForm((prev) => ({ ...prev, rawPrice: e.target.value }))}
              error={errors.rawPrice}
            />
          </div>

          {/* Composed from the library, then stored as text. The picker settles the wording; the
              textarea below is what a customer actually reads and is frozen into their quote. */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <LibraryPicker
                entity="lookup"
                type="INCLUSION"
                label="Inclusions from the library"
                multiple
                value={inclusionIds}
                onChange={(ids, items) => {
                  setInclusionIds(ids);
                  if (items) {
                    setForm((prev) => ({ ...prev, inclusions: composeLines(prev.inclusions, items) }));
                  }
                }}
                hint="Picking an item writes its wording below. Anything you typed yourself is kept."
              />
              <Textarea
                label="Inclusions"
                required
                rows={5}
                value={form.inclusions}
                onChange={(e) => setForm((prev) => ({ ...prev, inclusions: e.target.value }))}
                error={errors.inclusions}
                hint={!errors.inclusions ? 'One line per item. This is what the customer reads.' : undefined}
              />
            </div>
            <div className="flex flex-col gap-3">
              <LibraryPicker
                entity="lookup"
                type="EXCLUSION"
                label="Exclusions from the library"
                multiple
                value={exclusionIds}
                onChange={(ids, items) => {
                  setExclusionIds(ids);
                  if (items) {
                    setForm((prev) => ({ ...prev, exclusions: composeLines(prev.exclusions, items) }));
                  }
                }}
              />
              <Textarea
                label="Exclusions"
                required
                rows={5}
                value={form.exclusions}
                onChange={(e) => setForm((prev) => ({ ...prev, exclusions: e.target.value }))}
                error={errors.exclusions}
                hint={!errors.exclusions ? 'One line per item. This is what the customer reads.' : undefined}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChipInput label="Tags" values={tags} onChange={setTags} suggestions={TAG_SUGGESTIONS} />
            <RepeatableUrlList
              label="Gallery"
              purpose="packageGallery"
              values={gallery}
              onChange={setGallery}
            />
          </div>
        </Card>

        {!destinationId ? (
          <Card bodyClassName="py-8 text-center">
            <p className="text-neutral-500">Pick a destination above to build the itinerary and hotels.</p>
          </Card>
        ) : (
          <>
            {isEdit && (
              <Card title="Current itinerary (frozen copy — read only)">
                {currentDays.length === 0 ? (
                  <p className="text-sm text-neutral-400">No itinerary days yet.</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {currentDays.map((d) => (
                      <li key={d.id} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm">
                        <span className="font-medium text-neutral-900">Day {d.dayNumber}: {d.title}</span>
                        <p className="mt-0.5 text-neutral-500">{d.description}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            )}

            <Card title={isEdit ? 'Replace itinerary' : 'Itinerary builder'}>
              {isEdit && (
                <p className="mb-4 text-sm text-neutral-500">
                  Selecting day templates below will <strong>replace the entire itinerary</strong>{' '}
                  shown above once you save. Leave empty to keep the current itinerary untouched.
                </p>
              )}
              {errors.itinerary && (
                <Alert variant="danger" className="mb-4">
                  {errors.itinerary}
                </Alert>
              )}
              <DayTemplatePicker
                availableTemplates={dayTemplates}
                itinerary={itinerary}
                targetDays={isEdit && !itineraryTouched ? '' : form.days}
                onAdd={addDay}
                onRemove={removeDay}
                onMove={moveDay}
              />
            </Card>

            {isEdit && (
              <Card title="Current hotels (frozen copy — read only)">
                {currentHotels.length === 0 ? (
                  <p className="text-sm text-neutral-400">No hotels selected yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {currentHotels.map((h) => (
                      <li key={h.id} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm">
                        <span className="font-medium text-neutral-900">{h.hotelName}</span>{' '}
                        <span className="text-neutral-500">({h.hotelCategory})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            <Card title={isEdit ? 'Replace hotels' : 'Hotel selection'}>
              {isEdit && (
                <p className="mb-4 text-sm text-neutral-500">
                  Selecting hotels below will <strong>replace the whole hotel list</strong> shown
                  above once you save. Leave empty to keep the current hotels untouched.
                </p>
              )}
              <HotelPicker
                availableHotels={hotels}
                selected={selectedHotels}
                onAdd={addHotel}
                onRemove={removeHotel}
                onMove={moveHotel}
              />

              <CostFromRates
                hotelIds={selectedHotels.map((h) => h.hotelId)}
                nights={form.nights}
                estimate={rateEstimate}
                onEstimate={setRateEstimate}
              />
            </Card>
          </>
        )}

        <Card title="From the library">
          <p className="mb-4 text-sm text-neutral-500">
            Maintained once and reused. Changing any of these later affects packages built afterwards
            — never a quote that has already been issued, which keeps its own frozen copy.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LibraryPicker
              entity="cancellationPolicy"
              label="Cancellation policy"
              value={cancellationPolicyId}
              onChange={setCancellationPolicyId}
              placeholder="Search policies…"
              allowCreate={false}
              hint="Its bands are frozen into every quote generated from this package."
            />
            <LibraryPicker
              entity="faq"
              label="FAQs"
              multiple
              value={faqIds}
              onChange={setFaqIds}
              placeholder="Search FAQs…"
              allowCreate={false}
              hint="Written once, attached wherever they apply."
            />
          </div>
        </Card>

        <Button type="submit" loading={submitting} className="w-full sm:w-auto sm:self-end">
          {isEdit ? 'Save changes' : 'Create Package'}
        </Button>
      </form>
    </div>
  );
}

export default PackageFormPage;
