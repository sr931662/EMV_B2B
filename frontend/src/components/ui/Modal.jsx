import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import Icon from './Icon';

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Portalled to document.body so it can never be clipped by an ancestor's `overflow: hidden`.
 * Closes on Escape or a backdrop click; `onClose` is required — there is no other way out baked
 * in, so every caller must decide what "close" means for it.
 *
 * Three behaviours beyond the styling:
 *  - Background scroll is locked while open, so a long page behind the dialog can't scroll away
 *    under the user's cursor.
 *  - Focus moves into the panel on open and returns to the previously focused element on close,
 *    which is what keyboard and screen-reader users need to not lose their place.
 *  - Tab is trapped inside the panel while open.
 *
 * On phones the panel docks to the bottom of the viewport (a sheet); from `sm` up it is a
 * centred dialog. Long content scrolls inside the body, never the whole panel, so the header
 * and footer actions stay reachable.
 */
function Modal({ open, onClose, title, size = 'md', children, footer }) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    // Compensate for the vanishing scrollbar so the page behind doesn't shift sideways.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Prefer the first real control; fall back to the panel so focus never sits outside.
    const timer = setTimeout(() => {
      const [firstFocusable] = focusables();
      (firstFocusable ?? panelRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-neutral-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-scale-in flex-col overflow-hidden bg-white shadow-xl',
          'rounded-t-2xl sm:rounded-2xl',
          'ring-1 ring-neutral-900/5 focus:outline-none',
          SIZES[size] ?? SIZES.md
        )}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200/80 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1.5 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-neutral-200/80 bg-neutral-50 px-5 py-3.5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
