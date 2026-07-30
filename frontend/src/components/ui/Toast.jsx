import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import Icon from './Icon';

const ToastContext = createContext(null);

/*
 * Light surfaces with a coloured icon chip, not saturated solid-colour slabs. A stack of three
 * solid red/green bars is visually violent; a white card with a small coloured mark reads as a
 * system notification and stays legible over any page content.
 */
const VARIANTS = {
  info: { chip: 'bg-info-50 text-info-600 ring-info-200', glyph: 'info' },
  success: { chip: 'bg-success-50 text-success-600 ring-success-200', glyph: 'check-circle' },
  warning: { chip: 'bg-warning-50 text-warning-600 ring-warning-200', glyph: 'alert-triangle' },
  danger: { chip: 'bg-danger-50 text-danger-600 ring-danger-200', glyph: 'x-circle' },
};

const DEFAULT_DURATION_MS = 4000;

/**
 * Global toast queue. Mount <ToastProvider> once near the app root; any descendant calls
 * useToast() to fire one. Auto-dismisses after `duration`ms (default 4s) — pass `duration: 0`
 * for a toast that stays until the user dismisses it (e.g. a persistent error).
 */
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ variant = 'info', message, duration = DEFAULT_DURATION_MS }) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, variant, message }]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          // aria-live so a toast is announced without stealing focus. pointer-events-none on the
          // stack keeps the region from blocking clicks on the page beneath; each card re-enables
          // them for itself.
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
        >
          {toasts.map((t) => {
            const tone = VARIANTS[t.variant] ?? VARIANTS.info;
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  'pointer-events-auto flex w-full animate-slide-in-right items-start gap-3 rounded-xl bg-white p-3.5 pr-3',
                  'shadow-lg ring-1 ring-neutral-900/5 sm:w-auto sm:min-w-[19rem] sm:max-w-md'
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                    tone.chip
                  )}
                >
                  <Icon name={tone.glyph} size={15} />
                </span>
                <p className="min-w-0 flex-1 pt-1 text-[13px] font-medium leading-snug text-neutral-800">
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export { ToastProvider, useToast };
