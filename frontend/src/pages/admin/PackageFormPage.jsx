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
import { apiGet, apiPost, apiPatch, apiDownload, ApiError } from '../../api/client';
import { slugify } from '../../lib/format';

const TAG_SUGGESTIONS = ['Family', 'Honeymoon', 'Luxury', 'Adventure', 'Budget', 'Beach', 'Romantic', 'Group'];

const EMPTY_FORM = { title: '', days: '', nights: '', rawPrice: '', inclusions: '', exclusions: '' };

function PackageFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [pkgMeta, setPkgMeta] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const [destinations, setDestinations] = useState([]);
  const [destinationId, setDestinationId] = useState('');
  const [dayTemplates, setDayTemplates] = useState([]);
  const [hotels, setHotels] = useState([]);

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
    apiGet('/api/destinations').then((res) => setDestinations(res.destinations)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(null);
    apiGet(`/api/packages/${id}`)
      .then((res) => {
        const pkg = res.package;
        setPkgMeta(pkg);
        setDestinationId(pkg.destination.id);
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
      <Link to="/admin/packages" className="text-sm font-medium text-primary-600 hover:text-primary-700">
        &larr; Back to packages
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">
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
          <Select
            label="Destination"
            required
            disabled={isEdit}
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            error={errors.destinationId}
            hint={isEdit ? "A package can't move destinations once created." : undefined}
            options={[
              { value: '', label: 'Select a destination...' },
              ...destinations.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Textarea
              label="Inclusions"
              required
              rows={5}
              value={form.inclusions}
              onChange={(e) => setForm((prev) => ({ ...prev, inclusions: e.target.value }))}
              error={errors.inclusions}
              hint={!errors.inclusions ? 'One line per item' : undefined}
            />
            <Textarea
              label="Exclusions"
              required
              rows={5}
              value={form.exclusions}
              onChange={(e) => setForm((prev) => ({ ...prev, exclusions: e.target.value }))}
              error={errors.exclusions}
              hint={!errors.exclusions ? 'One line per item' : undefined}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChipInput label="Tags" values={tags} onChange={setTags} suggestions={TAG_SUGGESTIONS} />
            <RepeatableUrlList label="Gallery" values={gallery} onChange={setGallery} />
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
            </Card>
          </>
        )}

        <Button type="submit" loading={submitting} className="w-full sm:w-auto sm:self-end">
          {isEdit ? 'Save changes' : 'Create Package'}
        </Button>
      </form>
    </div>
  );
}

export default PackageFormPage;
