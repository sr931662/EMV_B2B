import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Button, Icon, Spinner } from '../ui';
import { apiGet, apiPost, ApiError } from '../../api/client';

/**
 * Searchable select over ANY library entity.
 *
 * One component for hotels, destinations, trip types, visa products and anything added later,
 * because the server projects every entity to the same option shape
 * ({ id, label, sublabel, imageUrl, meta }). A picker per entity is how the old Library ended up
 * with fifteen inconsistent screens.
 *
 * The inline "add to library" matters more than it looks. The friction of maintaining master data
 * is felt exactly when a search comes back empty, and sending someone to another screen at that
 * moment is what makes people type free text instead — which is the habit this whole system exists
 * to break.
 */

const DEBOUNCE_MS = 220;

function optionKey(option) {
  return String(option.id);
}

function LibraryPicker({
  entity,
  label,
  hint,
  // Single select: a value/onChange pair of ids. Multi: an array.
  multiple = false,
  value,
  onChange,
  // Narrows the list to a parent — hotels within a destination, visa products within a country.
  scopeId,
  // Required for vocabularies, which are always read one type at a time.
  type,
  placeholder = 'Search…',
  // Shows the create affordance. Off for entities a picker has no business creating inline.
  allowCreate = true,
  disabled = false,
  error,
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const [coords, setCoords] = useState(null);

  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const ids = multiple ? value ?? [] : value ? [value] : [];

  const runSearch = useCallback(
    async (term) => {
      setLoading(true);
      setPickerError(null);
      try {
        const params = new URLSearchParams();
        if (term) params.set('q', term);
        if (scopeId) params.set('scopeId', scopeId);
        if (type) params.set('type', type);

        const res = await apiGet(`/api/library/${entity}/search?${params.toString()}`);
        setOptions(res.options);
        setHighlight(0);
      } catch (err) {
        setPickerError(err instanceof ApiError ? err.message : 'Search failed.');
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [entity, scopeId, type]
  );

  // Resolve the ids we were handed into labels. Without this an edit form would show a row of
  // uuids until the user searched for something.
  useEffect(() => {
    let cancelled = false;

    if (ids.length === 0) {
      setSelected([]);
      return undefined;
    }

    // The search endpoint is the only uniform read, so resolve through it and match by id. Cheap
    // at picker sizes and avoids a second endpoint that would drift from this one.
    const params = new URLSearchParams({ limit: '50' });
    if (scopeId) params.set('scopeId', scopeId);
    if (type) params.set('type', type);

    apiGet(`/api/library/${entity}/search?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        const byId = new Map(res.options.map((o) => [optionKey(o), o]));
        setSelected(ids.map((id) => byId.get(String(id))).filter(Boolean));
      })
      .catch(() => {
        // Non-fatal: the form still works, the chips just show ids until the next search.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, scopeId, type, JSON.stringify(ids)]);

  useEffect(() => {
    if (!open) return undefined;

    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, runSearch]);

  // Close on an outside click, so an open list does not sit over the rest of the form. The
  // dropdown itself is portalled (see below) and so is no longer a DOM descendant of boxRef —
  // a click inside it has to be excluded explicitly or it would register as "outside" and the
  // list would close the instant anyone tried to click an option.
  useEffect(() => {
    if (!open) return undefined;

    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  /**
   * Positions the dropdown from the trigger's own bounding rect rather than relying on CSS
   * `position: absolute` inside the normal document flow.
   *
   * The picker is used inside Cards and Modals, both of which clip overflow for their own
   * rounded-corner reasons — an absolutely-positioned child of either one gets its dropdown
   * silently cut off (visually "stuck behind" whatever comes after it) no matter how high its
   * z-index goes, because overflow clipping happens before stacking order is ever considered.
   * Portalling to document.body (like Modal already does) and computing fixed coordinates here
   * is the only way out of that ancestor's clipping box.
   */
  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    updatePosition();
    // Capture phase so a scroll inside any ancestor container (not just the window) still
    // triggers a reposition — a scrolled Card would otherwise leave the dropdown floating over
    // the wrong spot.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  /**
   * Resolves ids back to the full options.
   *
   * Passed to onChange alongside the ids so a caller that needs the LABELS does not have to fetch
   * them again — the package builder composes its inclusions text from exactly this. Anything the
   * picker cannot resolve is dropped rather than emitted as a hole, so a caller can rely on
   * `items.length === ids.length` when it matters.
   */
  const itemsFor = (nextIds, extra = []) => {
    // `extra` carries an option that is not in state yet — the one just created inline. State
    // updates are async, so relying on setOptions having landed would drop it.
    const known = new Map([...selected, ...options, ...extra].map((o) => [optionKey(o), o]));

    return nextIds.map((id) => known.get(String(id))).filter(Boolean);
  };

  const emit = (nextIds, extra) =>
    onChange(multiple ? nextIds : nextIds[0] ?? '', itemsFor(nextIds, extra));

  const pick = (option) => {
    if (multiple) {
      emit(ids.includes(option.id) ? ids.filter((id) => id !== option.id) : [...ids, option.id], [option]);
    } else {
      emit([option.id], [option]);
      setOpen(false);
      setQuery('');
    }
  };

  const remove = (id) => {
    emit(multiple ? ids.filter((x) => x !== id) : []);
  };

  /** Creates the item the search could not find, then selects it. */
  const createInline = async () => {
    const name = query.trim();
    if (!name) return;

    setCreating(true);
    setPickerError(null);
    try {
      const body = { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
      if (type) body.type = type;
      if (scopeId) body.destinationId = scopeId;

      const res = await apiPost(`/api/library/${entity}`, body);
      const created = res.row;
      const option = {
        id: created.id,
        label: created.name ?? created.title ?? created.question,
        sublabel: null,
        imageUrl: null,
        meta: {},
      };

      // Into the options list BEFORE selecting it, so itemsFor can resolve it — otherwise a caller
      // that needs the label gets an id it cannot name for the rest of the session.
      setOptions((prev) => [option, ...prev]);
      pick(option);
      await runSearch(query);
    } catch (err) {
      setPickerError(
        err instanceof ApiError ? err.message : 'Could not add that. Create it in the Library first.'
      );
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && options[highlight]) {
      e.preventDefault();
      pick(options[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const shown = pickerError || error;

  return (
    <div className="flex flex-col gap-1.5" ref={boxRef}>
      {label && (
        <label className="text-[13px] font-medium text-neutral-700">
          {label}
        </label>
      )}

      {/* Selected items sit above the input so a long multi-select never pushes the search box
          off-screen. */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span
              key={optionKey(option)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 py-1 pl-2 pr-1 text-[12px] text-primary-800 ring-1 ring-inset ring-primary-100"
            >
              {option.imageUrl && (
                <img src={option.imageUrl} alt="" aria-hidden="true" className="size-4 rounded-full object-cover" />
              )}
              {option.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(option.id)}
                  aria-label={`Remove ${option.label}`}
                  className="rounded-full p-0.5 text-primary-600 hover:bg-primary-100"
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${entity}-options`}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-neutral-300 px-3 pr-8 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:bg-neutral-50"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
          {loading ? <Spinner size="sm" /> : <Icon name="search" size={15} />}
        </span>

        {open && coords && createPortal(
          <div
            ref={dropdownRef}
            id={`${entity}-options`}
            role="listbox"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
            // Fixed, not absolute: this panel is portalled to document.body, so it has no
            // positioned ancestor to be "absolute" relative to, and fixed coordinates are what
            // updatePosition above computes. z-[60] sits above Modal's z-50 — a picker used
            // inside a modal (e.g. the Library's own edit forms) still needs its list on top.
            className="fixed z-[60] max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {options.map((option, i) => {
              const isSelected = ids.includes(option.id);

              return (
                <button
                  key={optionKey(option)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(option)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] ${
                    i === highlight ? 'bg-neutral-50' : ''
                  }`}
                >
                  {option.imageUrl ? (
                    <img src={option.imageUrl} alt="" aria-hidden="true" className="size-7 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400">
                      <Icon name="layers" size={13} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-neutral-900">{option.label}</span>
                    {option.sublabel && (
                      <span className="block truncate text-[12px] text-neutral-500">{option.sublabel}</span>
                    )}
                  </span>
                  {isSelected && <Icon name="check" size={14} className="shrink-0 text-primary-600" />}
                </button>
              );
            })}

            {!loading && options.length === 0 && (
              <div className="px-3 py-3">
                <p className="text-[13px] text-neutral-500">
                  {query ? `Nothing matches “${query}”.` : 'Type to search the library.'}
                </p>
                {allowCreate && query.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={creating}
                    className="mt-2"
                    onClick={createInline}
                  >
                    <Icon name="plus" size={13} />
                    Add “{query.trim()}” to the library
                  </Button>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
      </div>

      {shown ? (
        <p className="text-[12px] text-danger-600">{shown}</p>
      ) : (
        hint && <p className="text-[12px] text-neutral-500">{hint}</p>
      )}
    </div>
  );
}

export default LibraryPicker;
