import { cn } from '../../lib/cn';

const VARIANTS = {
  neutral: 'bg-neutral-100 text-neutral-700',
  primary: 'bg-primary-50 text-primary-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
};

/**
 * Maps the backend's status enums (QuoteStatus, PaymentStatus, VisaRequestStatus — see
 * API_SURFACE.md) to a Badge variant, so every status pill in the app reads consistently
 * without every feature screen re-inventing the mapping. Unknown values fall back to neutral
 * rather than throwing — new statuses should never crash a list screen.
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

/** Small status pill. Pass `variant` directly, or `status="PENDING_VERIFICATION"` to auto-map. */
function Badge({ variant, status, className = '', children }) {
  const resolved = variant ?? (status ? statusVariant(status) : 'neutral');
  const label = children ?? (status ? status.replaceAll('_', ' ') : null);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANTS[resolved],
        className
      )}
    >
      {label}
    </span>
  );
}

export default Badge;
export { statusVariant };
