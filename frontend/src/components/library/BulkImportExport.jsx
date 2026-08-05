import { useRef, useState } from 'react';
import { Alert, Badge, Button, Icon, Modal, Switch, useToast } from '../ui';
import { apiDownload, apiUpload, ApiError } from '../../api/client';

/**
 * Export-as-template / import-from-spreadsheet.
 *
 * Deliberately thin: every rule about what a row may contain lives on the server
 * (backend/src/services/bulkDataService.js) — either the generic `libraryService.create/update`
 * path (registry-driven entities), or one of that file's bespoke per-entity pairs
 * (destinations/hotels/day templates, each calling its own dedicated service so dedup, country
 * resolution and active-parent checks stay intact). This component's only job is the file
 * round-trip and showing what happened — it does not reimplement any validation itself, and does
 * not care which of the two backend paths a given entity uses.
 *
 * @param entity        registry key (e.g. "country") — used to build the default `/api/library/...`
 *                       URLs below. Omit when passing `exportUrl`/`importUrl` explicitly instead.
 * @param entityMeta     the /api/library/entities row for this entity (used for its label and for
 *                       the lookup "type" requirement). Omit for non-registry entities and pass
 *                       `label` instead.
 * @param label          display label when there is no `entityMeta` (destinations, hotels, ...).
 * @param requiredType   the lookup "type" filter value, when entityMeta.requiredFilter === 'type'.
 * @param exportUrl      overrides the default `/api/library/:entity/export` path.
 * @param importUrl      overrides the default `/api/library/:entity/import` path.
 * @param extraParams    extra query params merged into the export request (e.g. destinationId for
 *                       a hotel/day-template export scoped to one destination).
 * @param extraFields    extra form fields merged into the import upload (same shape, for the
 *                       import side — a hotel/day-template import needs to say which destination).
 * @param disabled       disables both actions and shows `disabledHint` instead of the archived
 *                       toggle — for a scoped export/import waiting on its scope to be chosen.
 * @param disabledHint   shown in place of the controls while `disabled`.
 * @param onImported     called after a successful import so the list behind this reloads.
 */
function BulkImportExport({
  entity,
  entityMeta,
  label: labelProp,
  requiredType,
  exportUrl,
  importUrl,
  extraParams,
  extraFields,
  disabled = false,
  disabledHint,
  onImported,
}) {
  const inputRef = useRef(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const { showToast } = useToast();

  const needsType = entityMeta?.requiredFilter === 'type';
  const label = labelProp ?? entityMeta?.label ?? 'items';
  const resolvedExportUrl = exportUrl ?? `/api/library/${entity}/export`;
  const resolvedImportUrl = importUrl ?? `/api/library/${entity}/import`;

  const buildQuery = () => {
    const params = new URLSearchParams({ includeArchived: String(includeArchived) });
    if (needsType && requiredType) params.set('type', requiredType);
    Object.entries(extraParams ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    return params.toString();
  };

  const handleExport = async () => {
    if (needsType && !requiredType) {
      showToast({ variant: 'warning', message: 'Choose a vocabulary type first.' });
      return;
    }

    setExporting(true);
    try {
      await apiDownload(`${resolvedExportUrl}?${buildQuery()}`);
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Export failed.' });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (needsType && !requiredType) {
      showToast({ variant: 'warning', message: 'Choose a vocabulary type first.' });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (needsType) formData.append('type', requiredType);
    Object.entries(extraFields ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') formData.append(key, value);
    });

    setImporting(true);
    try {
      const res = await apiUpload(resolvedImportUrl, formData);
      setResult(res);
      if (res.created || res.updated) onImported?.();
      showToast({
        variant: res.errors?.length ? 'warning' : 'success',
        message: res.message,
      });
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Import failed.' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" loading={exporting} disabled={disabled} onClick={handleExport}>
        <Icon name="download" size={13} />
        Export
      </Button>
      <Button
        variant="outline"
        size="sm"
        loading={importing}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Icon name="upload" size={13} />
        Import
      </Button>
      <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />

      {disabled ? (
        disabledHint && <span className="text-[12px] text-neutral-400">{disabledHint}</span>
      ) : (
        <Switch
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
          label="Include archived in export"
        />
      )}

      <Modal
        open={Boolean(result)}
        onClose={() => setResult(null)}
        title={`Import result — ${label}`}
        footer={<Button onClick={() => setResult(null)}>Close</Button>}
      >
        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{result.created} created</Badge>
              <Badge variant="neutral">{result.updated} updated</Badge>
              {result.skipped > 0 && <Badge variant="neutral">{result.skipped} blank row(s) skipped</Badge>}
              {result.errors?.length > 0 && <Badge variant="danger">{result.errors.length} failed</Badge>}
            </div>

            {result.errors?.length > 0 && (
              <Alert variant="warning">
                <p className="mb-1.5 font-medium">These rows were not saved — fix them and re-import:</p>
                <ul className="flex flex-col gap-1 text-[12.5px]">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      <span className="font-mono text-neutral-500">Row {e.row}:</span> {e.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default BulkImportExport;
