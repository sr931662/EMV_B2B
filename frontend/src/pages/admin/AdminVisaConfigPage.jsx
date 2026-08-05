import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '../../components/ui';
import VisaSubNav from '../../components/admin/VisaSubNav';
import ImageUploadField from '../../components/shared/ImageUploadField';
import LibraryPicker from '../../components/library/LibraryPicker';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';
import {
  VISA_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_OPTIONS,
  DOCUMENT_PROFILE_LABELS,
  ENTRY_TYPE_LABELS,
  formatProcessingTime,
} from '../../lib/visaProducts';

/*
 * Three nested levels, narrowing left to right down the page:
 *
 *   Country  ->  Product ("Tourist eVisa", "Visa on arrival")  ->  Required documents
 *
 * The product level exists because one country sells several visa options with different
 * processing times, fees and paperwork, and the country row can only hold one of each.
 */

const PAGE_SIZE = 50;

function CountryModal({ open, onClose, editing, onSaved }) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [flagImageUrl, setFlagImageUrl] = useState('');
  const [aboutCountry, setAboutCountry] = useState('');
  const [arrivalInfo, setArrivalInfo] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setShortName(editing?.shortName ?? '');
      setCoverImageUrl(editing?.coverImageUrl ?? '');
      setFlagImageUrl(editing?.flagImageUrl ?? '');
      setAboutCountry(editing?.aboutCountry ?? '');
      setArrivalInfo(editing?.arrivalInfo ?? '');
      setBaseFee(editing ? String(editing.baseFee) : '0');
      setErrors({});
      setFormError(null);
    }
  }, [open, editing]);

  const handleSave = async () => {
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Required';
    if (baseFee === '' || Number(baseFee) < 0) nextErrors.baseFee = 'Required, 0 or more';
    if (coverImageUrl.trim() && !coverImageUrl.trim().startsWith('https://')) {
      nextErrors.coverImageUrl = 'Must be an https URL';
    }
    if (flagImageUrl.trim() && !flagImageUrl.trim().startsWith('https://')) {
      nextErrors.flagImageUrl = 'Must be an https URL';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Blank clears the field rather than storing an empty string, so "no image" is one value
    // everywhere instead of two the card would both have to test for.
    const payload = {
      name: name.trim(),
      baseFee: Number(baseFee),
      shortName: shortName.trim() || null,
      coverImageUrl: coverImageUrl.trim() || null,
      flagImageUrl: flagImageUrl.trim() || null,
      aboutCountry: aboutCountry.trim() || null,
      arrivalInfo: arrivalInfo.trim() || null,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/visa-countries/${editing.id}`, payload);
        showToast({ variant: 'success', message: 'Visa country updated.' });
      } else {
        // create rejects explicit nulls, so only send what was actually filled in.
        const createPayload = Object.fromEntries(
          Object.entries(payload).filter(([, v]) => v !== null)
        );
        const res = await apiPost('/api/visa-countries', createPayload);
        showToast({ variant: 'success', message: res.message });
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit visa country' : 'New visa country'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
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
          label="Country name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Input
          label="Short name"
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          hint='Used on narrow cards, e.g. "UAE" for United Arab Emirates'
        />
<ImageUploadField
          label="Cover image"
          purpose="visaCountry"
          value={coverImageUrl}
          onChange={setCoverImageUrl}
          error={errors.coverImageUrl}
        />
        <ImageUploadField
          label="Flag image"
          purpose="visaCountry"
          value={flagImageUrl}
          onChange={setFlagImageUrl}
          error={errors.flagImageUrl}
          hint="Upload one, or use a free flag CDN such as https://flagcdn.com/w320/ae.png"
        />
        <Textarea
          label="About this country"
          rows={4}
          value={aboutCountry}
          onChange={(e) => setAboutCountry(e.target.value)}
          hint="Markdown. Shown as the hero blurb on the visa detail page."
        />
        <Textarea
          label="On arrival"
          rows={4}
          value={arrivalInfo}
          onChange={(e) => setArrivalInfo(e.target.value)}
          hint="Markdown. What travellers need at immigration — shared by every visa for this country."
        />
        <Input
          label="Default base fee (per passenger)"
          type="number"
          min="0"
          step="0.01"
          required
          value={baseFee}
          onChange={(e) => setBaseFee(e.target.value)}
          error={errors.baseFee}
          hint={
            !errors.baseFee
              ? 'A fallback only. What a partner actually pays comes from the visa product they pick.'
              : undefined
          }
        />
      </div>
    </Modal>
  );
}

function ProductModal({ open, onClose, countryId, editing, onSaved }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('STICKER_VISA');
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [maxStayDays, setMaxStayDays] = useState('');
  const [entryType, setEntryType] = useState('SINGLE');
  const [adultFee, setAdultFee] = useState('0');
  const [childFee, setChildFee] = useState('0');
  const [faqs, setFaqs] = useState('');
  const [steps, setSteps] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setCategory(editing?.category ?? 'STICKER_VISA');
      setMinDays(editing?.processingDaysMin != null ? String(editing.processingDaysMin) : '');
      setMaxDays(editing?.processingDaysMax != null ? String(editing.processingDaysMax) : '');
      setValidityDays(editing?.validityDays != null ? String(editing.validityDays) : '');
      setMaxStayDays(editing?.maxStayDays != null ? String(editing.maxStayDays) : '');
      setEntryType(editing?.entryType ?? 'SINGLE');
      setAdultFee(editing ? String(editing.adultFee) : '0');
      setChildFee(editing ? String(editing.childFee) : '0');
      setFaqs(editing?.faqs ?? '');
      setSteps(
        (editing?.processingSteps ?? []).map((st) => ({
          title: st.title ?? '',
          description: st.description ?? '',
          estimatedDays: st.estimatedDays != null ? String(st.estimatedDays) : '',
        }))
      );
      setErrors({});
      setFormError(null);
    }
  }, [open, editing]);

  const handleSave = async () => {
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Required';
    if (adultFee === '' || Number(adultFee) < 0) nextErrors.adultFee = 'Required, 0 or more';
    if (childFee === '' || Number(childFee) < 0) nextErrors.childFee = 'Required, 0 or more';
    if (minDays !== '' && maxDays !== '' && Number(minDays) > Number(maxDays)) {
      nextErrors.maxDays = 'Cannot be less than the minimum';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Empty stays empty rather than becoming 0: a blank timeline means "not published yet", and
    // 0 would advertise this as an instant visa.
    const payload = {
      name: name.trim(),
      category,
      entryType,
      adultFee: Number(adultFee),
      childFee: Number(childFee),
      processingDaysMin: minDays === '' ? null : Number(minDays),
      processingDaysMax: maxDays === '' ? null : Number(maxDays),
      validityDays: validityDays === '' ? null : Number(validityDays),
      maxStayDays: maxStayDays === '' ? null : Number(maxStayDays),
      faqs: faqs.trim() || null,
      // Position in this array becomes sortOrder server-side, so reordering here is the whole
      // reorder operation — there are no index numbers to keep in sync.
      processingSteps: steps
        .filter((st) => st.title.trim())
        .map((st) => ({
          title: st.title.trim(),
          description: st.description.trim() || null,
          estimatedDays: st.estimatedDays === '' ? null : Number(st.estimatedDays),
        })),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/visa-products/${editing.id}`, payload);
        showToast({ variant: 'success', message: 'Visa product updated.' });
      } else {
        // create rejects explicit nulls, so send only the day counts that were filled in.
        const createPayload = Object.fromEntries(
          Object.entries(payload).filter(([, v]) => v !== null)
        );
        await apiPost('/api/visa-products', { ...createPayload, visaCountryId: countryId });
        showToast({ variant: 'success', message: 'Visa product created.' });
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const informational = category === 'VISA_FREE' || category === 'VISA_ON_ARRIVAL';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit visa product' : 'New visa product'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
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
          label="Product name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          hint={!errors.name ? 'What partners see, e.g. "Tourist eVisa (30 days)" or "Express sticker visa"' : undefined}
        />

        <Select
          label="Visa type"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={Object.entries(VISA_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
        />

        {informational && (
          <Alert variant="info">
            {VISA_CATEGORY_LABELS[category]} entries are listed for information only — partners can
            see them but cannot apply, because there is no application to submit.
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Processing — fastest"
            type="number"
            min="0"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            hint="Working days. 0 = instant."
          />
          <Input
            label="Processing — slowest"
            type="number"
            min="0"
            value={maxDays}
            onChange={(e) => setMaxDays(e.target.value)}
            error={errors.maxDays}
            hint={!errors.maxDays ? 'Filters and delivery promises use this one.' : undefined}
          />
        </div>

        <Alert variant="info">
          Leave both blank if the timeline is not confirmed. A product with no timeline never
          appears under a speed filter and shows partners &ldquo;timeline not published&rdquo;
          rather than a promise nobody made.
        </Alert>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Visa validity"
            type="number"
            min="1"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            hint="Calendar days the visa stays valid"
          />
          <Input
            label="Maximum stay"
            type="number"
            min="1"
            value={maxStayDays}
            onChange={(e) => setMaxStayDays(e.target.value)}
            hint="Calendar days per visit"
          />
        </div>

        <Select
          label="Entry type"
          required
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
          options={Object.entries(ENTRY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Adult fee (per head)"
            type="number"
            min="0"
            step="0.01"
            required
            value={adultFee}
            onChange={(e) => setAdultFee(e.target.value)}
            error={errors.adultFee}
          />
          <Input
            label="Child fee (per head)"
            type="number"
            min="0"
            step="0.01"
            required
            value={childFee}
            onChange={(e) => setChildFee(e.target.value)}
            error={errors.childFee}
            hint={!errors.childFee ? '0 if children travel free' : undefined}
          />
        </div>

        <Textarea
          label="FAQs"
          rows={4}
          value={faqs}
          onChange={(e) => setFaqs(e.target.value)}
          hint="Markdown. Questions specific to THIS visa, not to the country."
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">Processing timeline</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSteps([...steps, { title: '', description: '', estimatedDays: '' }])}
            >
              <Icon name="plus" size={14} />
              Add step
            </Button>
          </div>

          {steps.length === 0 ? (
            <p className="text-[13px] text-neutral-500">
              No steps yet. Without them the detail page simply omits the timeline section.
            </p>
          ) : (
            steps.map((st, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="rounded-lg border border-neutral-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-[13px] font-semibold text-neutral-400">{i + 1}</span>
                  <div className="flex flex-1 flex-col gap-2">
                    <Input
                      label="Step"
                      value={st.title}
                      onChange={(e) => {
                        const next = [...steps];
                        next[i] = { ...st, title: e.target.value };
                        setSteps(next);
                      }}
                    />
                    <Input
                      label="Estimated working days"
                      type="number"
                      min="0"
                      value={st.estimatedDays}
                      onChange={(e) => {
                        const next = [...steps];
                        next[i] = { ...st, estimatedDays: e.target.value };
                        setSteps(next);
                      }}
                      hint="Blank if it varies"
                    />
                    <Textarea
                      label="Description"
                      rows={2}
                      value={st.description}
                      onChange={(e) => {
                        const next = [...steps];
                        next[i] = { ...st, description: e.target.value };
                        setSteps(next);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                  >
                    <Icon name="trash" size={14} />
                  </Button>
                </div>
              </div>
            ))
          )}

          {steps.length > 0 && maxDays !== '' && (
            <p className="text-[13px] text-neutral-500">
              Steps total{' '}
              {steps.reduce((sum, st) => sum + (Number(st.estimatedDays) || 0), 0)} days; published
              processing time is {maxDays}. They do not have to match, but a large gap usually
              means one of the two is out of date.
            </p>
          )}
        </div>

        <Alert variant="info">
          Both fees are frozen onto each request when it is created — repricing here never moves an
          existing request, and a child added to one later is still charged the rate that applied
          when it was created.
        </Alert>
      </div>
    </Modal>
  );
}

function DocumentModal({ open, onClose, productId, editing, onSaved }) {
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [isMandatory, setIsMandatory] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setDocumentTypeId(editing?.documentTypeId ?? '');
      setDocumentName(editing?.documentName ?? '');
      setCategory(editing?.category ?? 'OTHER');
      setIsMandatory(editing?.isMandatory ?? true);
      setError(null);
      setFormError(null);
    }
  }, [open, editing]);

  /**
   * Picking a library type fills in the wording and the category.
   *
   * This is the whole point of DocumentType: the same document was appearing as "Bank Statement",
   * "bank statement" and "6-month bank statements" across products, so the documents filter could
   * never work on it. The name stays editable afterwards — a product may legitimately say
   * "Passport (first and last page)" where the type is simply "Passport".
   */
  const applyType = (id, items) => {
    setDocumentTypeId(id);

    const chosen = items?.[0];
    if (!chosen) return;

    setDocumentName(chosen.label);
    if (chosen.meta?.category) setCategory(chosen.meta.category);
    if (chosen.meta?.isMandatoryByDefault !== undefined) setIsMandatory(chosen.meta.isMandatoryByDefault);
  };

  const handleSave = async () => {
    if (!documentName.trim()) {
      setError('Required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        documentTypeId: documentTypeId || null,
        documentName: documentName.trim(),
        category,
        isMandatory,
      };
      if (editing) {
        await apiPatch(`/api/visa-products/${productId}/documents/${editing.id}`, payload);
        showToast({ variant: 'success', message: 'Required document updated.' });
      } else {
        await apiPost(`/api/visa-products/${productId}/documents`, payload);
        showToast({ variant: 'success', message: 'Required document created.' });
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit required document' : 'New required document'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
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
        <LibraryPicker
          entity="documentType"
          label="Document type"
          value={documentTypeId}
          onChange={applyType}
          placeholder="Search the document library…"
          hint="Fills in the wording and the category below. Picking one is what makes the documents filter work across products."
        />
        <Input
          label="Document name"
          required
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
          error={error}
          hint={!error ? 'How the partner reads it. Override the library wording where this product needs to be more specific.' : undefined}
        />
        <Select
          label="Category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={DOCUMENT_CATEGORY_OPTIONS}
          hint="Drives the marketplace's documents filter. The name above is free text; this is the part partners filter on."
        />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
          Mandatory
        </label>
      </div>
    </Modal>
  );
}

function AdminVisaConfigPage() {
  const [countries, setCountries] = useState([]);
  const [countriesTotal, setCountriesTotal] = useState(0);
  const [countriesPage, setCountriesPage] = useState(1);
  const [includeArchivedCountries, setIncludeArchivedCountries] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countriesError, setCountriesError] = useState(null);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState(null);

  const [selectedCountryId, setSelectedCountryId] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState(1);
  const [includeArchivedProducts, setIncludeArchivedProducts] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [includeArchivedDocs, setIncludeArchivedDocs] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState(null);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);

  const { showToast } = useToast();

  const loadCountries = () => {
    setLoadingCountries(true);
    setCountriesError(null);
    const params = new URLSearchParams({
      includeArchived: String(includeArchivedCountries),
      limit: String(PAGE_SIZE),
      offset: String((countriesPage - 1) * PAGE_SIZE),
    });
    return apiGet(`/api/visa-countries?${params.toString()}`)
      .then((res) => {
        setCountries(res.countries);
        setCountriesTotal(res.total);
      })
      .catch((err) => setCountriesError(err instanceof ApiError ? err.message : 'Failed to load countries.'))
      .finally(() => setLoadingCountries(false));
  };

  useEffect(() => {
    setCountriesPage(1);
  }, [includeArchivedCountries]);

  useEffect(() => {
    loadCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchivedCountries, countriesPage]);

  const loadProducts = () => {
    if (!selectedCountryId) return undefined;
    setLoadingProducts(true);
    setProductsError(null);
    const params = new URLSearchParams({
      visaCountryId: selectedCountryId,
      includeArchived: String(includeArchivedProducts),
      limit: String(PAGE_SIZE),
      offset: String((productsPage - 1) * PAGE_SIZE),
    });
    return apiGet(`/api/visa-products?${params.toString()}`)
      .then((res) => {
        setProducts(res.products);
        setProductsTotal(res.total);
      })
      .catch((err) => setProductsError(err instanceof ApiError ? err.message : 'Failed to load products.'))
      .finally(() => setLoadingProducts(false));
  };

  useEffect(() => {
    setProductsPage(1);
  }, [selectedCountryId, includeArchivedProducts]);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryId, includeArchivedProducts, productsPage]);

  const loadDocuments = () => {
    if (!selectedProductId) return undefined;
    setLoadingDocs(true);
    setDocsError(null);
    return apiGet(`/api/visa-products/${selectedProductId}/documents?includeArchived=${includeArchivedDocs}`)
      .then((res) => setDocuments(res.documents))
      .catch((err) => setDocsError(err instanceof ApiError ? err.message : 'Failed to load documents.'))
      .finally(() => setLoadingDocs(false));
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, includeArchivedDocs]);

  const handleArchiveCountry = async (c) => {
    try {
      await apiDelete(`/api/visa-countries/${c.id}`);
      showToast({ variant: 'success', message: `${c.name} archived.` });
      await loadCountries();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestoreCountry = async (c) => {
    try {
      await apiPost(`/api/visa-countries/${c.id}/restore`);
      showToast({ variant: 'success', message: `${c.name} restored.` });
      await loadCountries();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  const handleArchiveProduct = async (p) => {
    try {
      await apiDelete(`/api/visa-products/${p.id}`);
      showToast({ variant: 'success', message: `"${p.name}" archived.` });
      if (selectedProductId === p.id) setSelectedProductId(null);
      await loadProducts();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestoreProduct = async (p) => {
    try {
      await apiPost(`/api/visa-products/${p.id}/restore`);
      showToast({ variant: 'success', message: `"${p.name}" restored.` });
      await loadProducts();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  const handleArchiveDoc = async (d) => {
    try {
      await apiDelete(`/api/visa-products/${selectedProductId}/documents/${d.id}`);
      showToast({ variant: 'success', message: `"${d.documentName}" archived.` });
      await loadDocuments();
      await loadProducts(); // the derived document profile may have changed
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestoreDoc = async (d) => {
    try {
      await apiPost(`/api/visa-products/${selectedProductId}/documents/${d.id}/restore`);
      showToast({ variant: 'success', message: `"${d.documentName}" restored.` });
      await loadDocuments();
      await loadProducts();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  const selectedCountry = countries.find((c) => c.id === selectedCountryId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
        Visa Configuration
      </h1>

      <VisaSubNav />

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">Countries</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={includeArchivedCountries}
                onChange={(e) => setIncludeArchivedCountries(e.target.checked)}
              />
              Show archived
            </label>
            <Button
              size="sm"
              onClick={() => {
                setEditingCountry(null);
                setCountryModalOpen(true);
              }}
            >
              + New Country
            </Button>
          </div>
        </div>

        {countriesError && <Alert variant="danger">{countriesError}</Alert>}

        {loadingCountries ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : countries.length === 0 ? (
          <Card bodyClassName="py-8 text-center">
            <p className="text-neutral-500">No visa countries yet.</p>
          </Card>
        ) : (
          <Card bodyClassName="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Default fee</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr
                    key={c.id}
                    className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                      selectedCountryId === c.id ? 'bg-primary-50' : ''
                    }`}
                    onClick={() => {
                      setSelectedCountryId(c.id);
                      setSelectedProductId(null);
                    }}
                  >
                    <td className="px-5 py-3 font-medium text-neutral-900">{c.name}</td>
                    <td className="px-5 py-3 text-neutral-700">{formatCurrency(c.baseFee)} / passenger</td>
                    <td className="px-5 py-3">
                      {c.archived ? (
                        <Badge variant="danger">Archived</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {!c.archived && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingCountry(c);
                              setCountryModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {c.archived ? (
                          <Button variant="outline" size="sm" onClick={() => handleRestoreCountry(c)}>
                            Restore
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => handleArchiveCountry(c)}>
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={countriesPage}
              pageSize={PAGE_SIZE}
              total={countriesTotal}
              onPageChange={setCountriesPage}
              loading={loadingCountries}
            />
          </Card>
        )}
      </div>

      {selectedCountryId && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">
              Visa products — {selectedCountry?.name}
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={includeArchivedProducts}
                  onChange={(e) => setIncludeArchivedProducts(e.target.checked)}
                />
                Show archived
              </label>
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null);
                  setProductModalOpen(true);
                }}
              >
                + New Product
              </Button>
            </div>
          </div>

          <p className="mb-3 text-sm text-neutral-500">
            One row per visa option this country offers. A country can list several — an eVisa and a
            sticker visa, or a standard and an express tier — each with its own processing time, fee
            and document checklist. Partners filter the marketplace on exactly these fields.
          </p>

          {productsError && <Alert variant="danger">{productsError}</Alert>}

          {loadingProducts ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : products.length === 0 ? (
            <Card bodyClassName="py-8 text-center">
              <p className="text-neutral-500">No visa products yet for this country.</p>
            </Card>
          ) : (
            <Card bodyClassName="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Processing</th>
                    <th className="px-5 py-3 font-medium">Validity / stay</th>
                    <th className="px-5 py-3 font-medium">Documents</th>
                    <th className="px-5 py-3 font-medium">Adult / child</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                        selectedProductId === p.id ? 'bg-primary-50' : ''
                      }`}
                      onClick={() => setSelectedProductId(p.id)}
                    >
                      <td className="px-5 py-3 font-medium text-neutral-900">{p.name}</td>
                      <td className="px-5 py-3 text-neutral-700">
                        {VISA_CATEGORY_LABELS[p.category] ?? p.category}
                        {!p.applicable && (
                          <span className="ml-2 text-xs text-neutral-400">info only</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-700">{formatProcessingTime(p)}</td>
                      <td className="px-5 py-3 text-neutral-700">
                        {p.validityDays ?? '—'} / {p.maxStayDays ?? '—'} days
                        <span className="ml-2 text-xs text-neutral-400">
                          {ENTRY_TYPE_LABELS[p.entryType] ?? p.entryType}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-neutral-700">
                        {DOCUMENT_PROFILE_LABELS[p.documentProfile] ?? p.documentProfile}
                      </td>
                      <td className="px-5 py-3 text-neutral-700">
                        {formatCurrency(p.adultFee)} / {formatCurrency(p.childFee)}
                      </td>
                      <td className="px-5 py-3">
                        {p.archived ? (
                          <Badge variant="danger">Archived</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {!p.archived && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingProduct(p);
                                setProductModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                          {p.archived ? (
                            <Button variant="outline" size="sm" onClick={() => handleRestoreProduct(p)}>
                              Restore
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleArchiveProduct(p)}>
                              Archive
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={productsPage}
                pageSize={PAGE_SIZE}
                total={productsTotal}
                onPageChange={setProductsPage}
                loading={loadingProducts}
              />
            </Card>
          )}
        </div>
      )}

      {selectedProductId && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">
              Required documents — {selectedProduct?.name}
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={includeArchivedDocs}
                  onChange={(e) => setIncludeArchivedDocs(e.target.checked)}
                />
                Show archived
              </label>
              <Button
                size="sm"
                onClick={() => {
                  setEditingDoc(null);
                  setDocModalOpen(true);
                }}
              >
                + New Document
              </Button>
            </div>
          </div>

          <p className="mb-3 text-sm text-neutral-500">
            This checklist is what partners see when applying for this product — each new visa
            request freezes a snapshot of it at creation time, so editing here never changes
            requirements for applications already in progress.
          </p>

          <Alert variant="info" className="mb-3">
            Passport, PAN, Photo, Flight Tickets (Round Trip), Hotel Voucher and Bank Statement are
            always mandatory for every visa request. Configure only product-specific extras here.
            The category on each row is what the marketplace&rsquo;s documents filter reads — this
            product currently reads as{' '}
            <strong>{DOCUMENT_PROFILE_LABELS[selectedProduct?.documentProfile] ?? '—'}</strong>.
          </Alert>

          {docsError && <Alert variant="danger">{docsError}</Alert>}

          {loadingDocs ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : documents.length === 0 ? (
            <Card bodyClassName="py-8 text-center">
              <p className="text-neutral-500">No required documents configured yet.</p>
            </Card>
          ) : (
            <Card bodyClassName="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="px-5 py-3 font-medium">Document</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-5 py-3 text-neutral-900">{d.documentName}</td>
                      <td className="px-5 py-3 text-neutral-700">
                        {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={d.isMandatory ? 'warning' : 'neutral'}>
                          {d.isMandatory ? 'Mandatory' : 'Optional'}
                        </Badge>
                      </td>
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingDoc(d);
                                setDocModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                          {d.archived ? (
                            <Button variant="outline" size="sm" onClick={() => handleRestoreDoc(d)}>
                              Restore
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleArchiveDoc(d)}>
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
        </div>
      )}

      <CountryModal
        open={countryModalOpen}
        onClose={() => setCountryModalOpen(false)}
        editing={editingCountry}
        onSaved={() => {
          setCountryModalOpen(false);
          loadCountries();
        }}
      />

      {selectedCountryId && (
        <ProductModal
          open={productModalOpen}
          onClose={() => setProductModalOpen(false)}
          countryId={selectedCountryId}
          editing={editingProduct}
          onSaved={() => {
            setProductModalOpen(false);
            loadProducts();
          }}
        />
      )}

      {selectedProductId && (
        <DocumentModal
          open={docModalOpen}
          onClose={() => setDocModalOpen(false)}
          productId={selectedProductId}
          editing={editingDoc}
          onSaved={() => {
            setDocModalOpen(false);
            loadDocuments();
            loadProducts();
          }}
        />
      )}
    </div>
  );
}

export default AdminVisaConfigPage;
