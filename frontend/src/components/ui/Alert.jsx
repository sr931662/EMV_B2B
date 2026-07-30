import { cn } from '../../lib/cn';
import Icon from './Icon';

/*
 * Each variant gets a left accent bar (via `border-l-4`) plus a matching icon. Colour alone is
 * not an accessible signal — the icon means the difference between "saved" and "failed" survives
 * both colour-blindness and a greyscale print of the screen.
 */
const VARIANTS = {
  info: {
    box: 'bg-info-50 text-info-700 ring-info-200 border-l-info-500',
    icon: 'text-info-600',
    glyph: 'info',
  },
  success: {
    box: 'bg-success-50 text-success-700 ring-success-200 border-l-success-500',
    icon: 'text-success-600',
    glyph: 'check-circle',
  },
  warning: {
    box: 'bg-warning-50 text-warning-700 ring-warning-200 border-l-warning-500',
    icon: 'text-warning-600',
    glyph: 'alert-triangle',
  },
  danger: {
    box: 'bg-danger-50 text-danger-700 ring-danger-200 border-l-danger-500',
    icon: 'text-danger-600',
    glyph: 'x-circle',
  },
};

/**
 * Static inline banner — form-level errors, page-level notices. For transient pop-ups use Toast.
 */
function Alert({ variant = 'info', title, children, onDismiss, className = '' }) {
  const tone = VARIANTS[variant] ?? VARIANTS.info;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-sm',
        'ring-1 ring-inset',
        tone.box,
        className
      )}
    >
      <Icon name={tone.glyph} size={17} className={cn('mt-px shrink-0', tone.icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-current">{title}</p>}
        {children && <div className={cn('text-current/90', title && 'mt-0.5')}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded-md p-1 text-current opacity-50 transition-opacity hover:bg-black/5 hover:opacity-100"
        >
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}

export default Alert;
