import { Button } from '../ui';

/** Repeatable plain-text URL rows — used for hotel/package image galleries. Real file upload
 * isn't wired yet; these are stored as given (see backend/src/utils/librarySchemas.js's
 * imagesField comment), so this is a plain URL list for now, not a file picker. */
function RepeatableUrlList({ label, values, onChange, placeholder = 'https://...' }) {
  const setAt = (i, v) => onChange(values.map((x, idx) => (idx === i ? v : x)));
  const addRow = () => onChange([...values, '']);
  const removeRow = (i) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      <p className="text-xs text-neutral-400">
        Paste image URLs — direct file upload isn&apos;t wired up yet.
      </p>
      {values.map((v, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="flex gap-2">
          <input
            value={v}
            onChange={(e) => setAt(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-sm font-medium text-danger-600 hover:text-danger-700"
          >
            Remove
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
        + Add image URL
      </Button>
    </div>
  );
}

export default RepeatableUrlList;
