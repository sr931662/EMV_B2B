import { cn } from '../../lib/cn';

const VARIANTS = {
  info: 'bg-info-50 text-info-700 border-info-200',
  success: 'bg-success-50 text-success-700 border-success-200',
  warning: 'bg-warning-50 text-warning-700 border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
};

/** Static inline banner — form-level errors, page-level notices. For transient pop-ups, use Toast instead. */
function Alert({ variant = 'info', title, children, onDismiss, className = '' }) {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', VARIANTS[variant], className)}
    >
      <div className="flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-current opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default Alert;
