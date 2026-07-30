import { cn } from '../../lib/cn';

/*
 * Tinted fill + a hairline inset ring in the same hue. The ring is what keeps a pale pill
 * legible against a white card — a fill-only badge dissolves into the surface.
 */
const VARIANTS = {
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  primary: 'bg-primary-50 text-primary-700 ring-primary-100',
  accent: 'bg-accent-50 text-accent-700 ring-accent-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  info: 'bg-info-50 text-info-700 ring-info-200',
};

const DOTS = {
  neutral: 'bg-neutral-400',
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
};

/**
 * Maps the backend's status enums (QuoteStatus, PaymentStatus, VisaRequestStatus — see
 * API_SURFACE.md) to a Badge variant, so every status pill in the app reads consistently
 * without every feature screen re-inventing the mapping. Unknown values fall back to neutral
 * rather than throwing — a new status should never crash a list screen.
 */
const STATUS_VARIANTS = {
  // Positive / confirmed
  BOOKING_CONFIRMED: 'success',
  ORDER_COMPLETED: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  CUSTOMER_APPROVED: 'success',
  VISA_PROCESSING_STARTED: 'info',
  PAYMENT_APPROVED: 'info',
  // In progress / awaiting action
  QUOTE_GENERATED: 'neutral',
  APPLICATION_SUBMITTED: 'neutral',
  PAYMENT_SUBMITTED: 'primary',
  PENDING_VERIFICATION: 'warning',
  INFO_REQUESTED: 'warning',
  // Negative / terminal-bad
  REJECTED: 'danger',
};

function statusVariant(status) {
  return STATUS_VARIANTS[status] ?? 'neutral';
}

/**
 * Small status pill. Pass `variant` directly, or `status="PENDING_VERIFICATION"` to auto-map.
 *
 * A leading dot is drawn only for `status` pills — those encode workflow state, where the dot
 * carries real scanning value. Plain `variant` badges (tags, type labels) stay clean.
 */
function Badge({ variant, status, dot, className = '', children }) {
  const resolved = variant ?? (status ? statusVariant(status) : 'neutral');
  const label = children ?? (status ? status.replaceAll('_', ' ') : null);
  const showDot = dot ?? Boolean(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase',
        'ring-1 ring-inset',
        'tracking-wide',
        VARIANTS[resolved] ?? VARIANTS.neutral,
        className
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', DOTS[resolved] ?? DOTS.neutral)}
        />
      )}
      {label}
    </span>
  );
}

export default Badge;
export { statusVariant };
