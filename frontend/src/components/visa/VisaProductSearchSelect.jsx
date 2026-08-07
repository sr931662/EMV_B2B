import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui';
import { FieldLabel, FieldMessage } from '../ui/Input';

/**
 * Searchable picker over an already-loaded list of visa products.
 *
 * A plain <select> here used to list every visa product across every country in one native
 * dropdown — fine with a handful of countries, unusable once the list runs into dozens, because a
 * native select has no way to filter and becomes a long blind scroll. The products are already
 * fetched client-side (NewVisaRequestPage), so this filters in memory rather than adding a second
 * network round trip for what the page already has.
 */
function VisaProductSearchSelect({ products, value, onChange, label, error, hint }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [coords, setCoords] = useState(null);

  const boxRef = useRef(null);
  const dropdownRef = useRef(null);

  const selected = products.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;

    return products.filter((p) => {
      const haystack = `${p.visaCountry?.name ?? ''} ${p.name}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [products, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

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

  // Same reasoning as LibraryPicker: portalled to document.body so a Card's overflow clipping
  // cannot cut the list off, with coordinates recomputed on scroll/resize.
  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  const pick = (product) => {
    onChange(product.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const displayValue = open ? query : selected ? `${selected.visaCountry.name} — ${selected.name}` : '';

  return (
    <div className="flex flex-col gap-1.5" ref={boxRef}>
      {label && <FieldLabel required>{label}</FieldLabel>}
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          value={displayValue}
          placeholder="Search by country or visa name…"
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-neutral-300 px-3 pr-8 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
          <Icon name="search" size={15} />
        </span>

        {open &&
          coords &&
          createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              style={{ top: coords.top, left: coords.left, width: coords.width }}
              className="fixed z-[60] max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
            >
              {filtered.length === 0 && (
                <p className="px-3 py-3 text-[13px] text-neutral-500">
                  Nothing matches &ldquo;{query}&rdquo;.
                </p>
              )}
              {filtered.map((product, i) => (
                <button
                  key={product.id}
                  type="button"
                  role="option"
                  aria-selected={product.id === value}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(product)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] ${
                    i === highlight ? 'bg-neutral-50' : ''
                  }`}
                >
                  {product.visaCountry?.flagImageUrl ? (
                    <img
                      src={product.visaCountry.flagImageUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-4 w-6 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400">
                      <Icon name="globe" size={12} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-neutral-900">{product.visaCountry?.name}</span>
                    <span className="block truncate text-[12px] text-neutral-500">{product.name}</span>
                  </span>
                  {product.id === value && <Icon name="check" size={14} className="shrink-0 text-primary-600" />}
                </button>
              ))}
            </div>,
            document.body
          )}
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
}

export default VisaProductSearchSelect;
