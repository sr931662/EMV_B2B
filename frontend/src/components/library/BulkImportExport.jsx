import { useRef, useState } from 'react';
import { Alert, Badge, Button, Icon, Modal, Switch, useToast } from '../ui';
import { apiDownload, apiUpload, ApiError } from '../../api/client';

/**
 * Export-as-template / import-from-spreadsheet for one library entity.
 *
 * Deliberately thin: every rule about what a row may contain lives on the server
 * (backend/src/services/bulkDataService.js), layered on the exact same libraryService.create/update
 * calls the row-by-row editor uses. This component's only job is the file round-trip and showing
 * what happened — it does not reimplement any validation or permission logic itself.
 *
 * @param entity        registry key, e.g. "country"
 * @param entityMeta    the /api/library/entities row for this entity (used for its label)
 * @param requiredType  the lookup "type" filter value, when entityMeta.requiredFilter === 'type'
 * @param onImported    called after a successful import so the list behind this reloads
 */
function BulkImportExport({ entity, entityMeta, requiredType, onImported }) {
  const inputRef = useRef(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const { showToast } = useToast();

  const needsType = entityMeta?.requiredFilter === 'type';
  const label = entityMeta?.label ?? 'items';

  const buildQuery = () => {
    const params = new URLSearchParams({ includeArchived: String(includeArchived) });
    if (needsType && requiredType) params.set('type', requiredType);
    return params.toString();
  };

  const handleExport = async () => {
    if (needsType && !requiredType) {
      showToast({ variant: 'warning', message: 'Choose a vocabulary type first.' });
      return;
    }

    setExporting(true);
    try {
      await apiDownload(`/api/library/${entity}/export?${buildQuery()}`);
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

    setImporting(true);
    try {
      const res = await apiUpload(`/api/library/${entity}/import`, formData);
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
      <Button variant="outline" size="sm" loading={exporting} onClick={handleExport}>
        <Icon name="download" size={13} />
        Export
      </Button>
      <Button variant="outline" size="sm" loading={importing} onClick={() => inputRef.current?.click()}>
        <Icon name="upload" size={13} />
        Import
      </Button>
      <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />

      <Switch
        checked={includeArchived}
        onChange={(e) => setIncludeArchived(e.target.checked)}
        label="Include archived in export"
      />

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
