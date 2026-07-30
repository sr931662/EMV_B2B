import { useState } from 'react';
import { Badge } from '../ui';

/** Free-text chip input (type + Enter/comma to add) — used for package tags. The backend has
 * no fixed tag enum, so this stays free text with a few common suggestions, not a hard select. */
function ChipInput({ label, values, onChange, suggestions = [] }) {
  const [draft, setDraft] = useState('');

  const addChip = (value) => {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setDraft('');
  };

  const removeChip = (value) => onChange(values.filter((v) => v !== value));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(draft);
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      removeChip(values[values.length - 1]);
    }
  };

  const unusedSuggestions = suggestions.filter((s) => !values.includes(s));

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/40">
        {values.map((v) => (
          <Badge key={v} variant="neutral">
            <span className="flex items-center gap-1">
              {v}
              <button
                type="button"
                onClick={() => removeChip(v)}
                aria-label={`Remove ${v}`}
                className="opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addChip(draft)}
          placeholder={values.length === 0 ? 'Type a tag and press Enter...' : ''}
          className="min-w-[120px] flex-1 border-none text-sm outline-none"
        />
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addChip(s)}
              className="rounded-full border border-dashed border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-500 hover:border-primary-400 hover:text-primary-600"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChipInput;
