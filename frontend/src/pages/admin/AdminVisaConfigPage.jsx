import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Modal, Spinner, useToast } from '../../components/ui';
import VisaSubNav from '../../components/admin/VisaSubNav';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';

function CountryModal({ open, onClose, editing, onSaved }) {
  const [name, setName] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setBaseFee(editing ? String(editing.baseFee) : '0');
      setErrors({});
      setFormError(null);
    }
  }, [open, editing]);

  const handleSave = async () => {
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Required';
    if (baseFee === '' || Number(baseFee) < 0) nextErrors.baseFee = 'Required, 0 or more';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/visa-countries/${editing.id}`, { name: name.trim(), baseFee: Number(baseFee) });
        showToast({ variant: 'success', message: 'Visa country updated.' });
      } else {
        const res = await apiPost('/api/visa-countries', { name: name.trim(), baseFee: Number(baseFee) });
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
          label="Base visa fee (per passenger)"
          type="number"
          min="0"
          step="0.01"
          required
          value={baseFee}
          onChange={(e) => setBaseFee(e.target.value)}
          error={errors.baseFee}
          hint={!errors.baseFee ? "Wholesale fee per passenger — frozen onto each request when it's created" : undefined}
        />
      </div>
    </Modal>
  );
}

function DocumentModal({ open, onClose, countryId, editing, onSaved }) {
  const [documentName, setDocumentName] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setDocumentName(editing?.documentName ?? '');
      setIsMandatory(editing?.isMandatory ?? true);
      setError(null);
      setFormError(null);
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!documentName.trim()) {
      setError('Required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/api/visa-countries/${countryId}/documents/${editing.id}`, {
          documentName: documentName.trim(),
          isMandatory,
        });
        showToast({ variant: 'success', message: 'Required document updated.' });
      } else {
        await apiPost(`/api/visa-countries/${countryId}/documents`, {
          documentName: documentName.trim(),
          isMandatory,
        });
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
        <Input
          label="Document name"
          required
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
          error={error}
          hint={!error ? 'e.g. Passport Copy, Photo, Bank Statement' : undefined}
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
  const [includeArchivedCountries, setIncludeArchivedCountries] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countriesError, setCountriesError] = useState(null);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState(null);

  const [selectedCountryId, setSelectedCountryId] = useState(null);
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
    return apiGet(`/api/visa-countries?includeArchived=${includeArchivedCountries}`)
      .then((res) => setCountries(res.countries))
      .catch((err) => setCountriesError(err instanceof ApiError ? err.message : 'Failed to load countries.'))
      .finally(() => setLoadingCountries(false));
  };

  useEffect(() => {
    loadCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchivedCountries]);

  const loadDocuments = () => {
    if (!selectedCountryId) return undefined;
    setLoadingDocs(true);
    setDocsError(null);
    return apiGet(`/api/visa-countries/${selectedCountryId}/documents?includeArchived=${includeArchivedDocs}`)
      .then((res) => setDocuments(res.documents))
      .catch((err) => setDocsError(err instanceof ApiError ? err.message : 'Failed to load documents.'))
      .finally(() => setLoadingDocs(false));
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryId, includeArchivedDocs]);

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

  const handleArchiveDoc = async (d) => {
    try {
      await apiDelete(`/api/visa-countries/${selectedCountryId}/documents/${d.id}`);
      showToast({ variant: 'success', message: `"${d.documentName}" archived.` });
      await loadDocuments();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestoreDoc = async (d) => {
    try {
      await apiPost(`/api/visa-countries/${selectedCountryId}/documents/${d.id}/restore`);
      showToast({ variant: 'success', message: `"${d.documentName}" restored.` });
      await loadDocuments();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  const selectedCountry = countries.find((c) => c.id === selectedCountryId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Visa Configuration</h1>

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
                  <th className="px-5 py-3 font-medium">Base Fee</th>
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
                    onClick={() => setSelectedCountryId(c.id)}
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
          </Card>
        )}
      </div>

      {selectedCountryId && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">
              Required documents — {selectedCountry?.name}
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
            This checklist is what partners see when applying for this country — each new visa
            request freezes a snapshot of it at creation time, so editing here never changes
            requirements for applications already in progress.
          </p>

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
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-5 py-3 text-neutral-900">{d.documentName}</td>
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
        <DocumentModal
          open={docModalOpen}
          onClose={() => setDocModalOpen(false)}
          countryId={selectedCountryId}
          editing={editingDoc}
          onSaved={() => {
            setDocModalOpen(false);
            loadDocuments();
          }}
        />
      )}
    </div>
  );
}

export default AdminVisaConfigPage;
