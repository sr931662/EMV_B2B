import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

const ToastContext = createContext(null);

const VARIANTS = {
  info: 'bg-neutral-900 text-white',
  success: 'bg-success-600 text-white',
  warning: 'bg-warning-600 text-white',
  danger: 'bg-danger-600 text-white',
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
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                'flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg',
                VARIANTS[t.variant]
              )}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
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
