import { Fragment } from 'react';
import { cn } from '../../lib/cn';

const STEPS = ['Application', 'Documents', 'Payment', 'Processing', 'Completed'];

const PAYMENT_STATUSES = ['PAYMENT_SUBMITTED', 'PENDING_VERIFICATION'];
const PROCESSING_STATUSES = ['PAYMENT_APPROVED', 'VISA_PROCESSING_STARTED'];

/**
 * "Documents" isn't its own backend status (it's a sub-phase of APPLICATION_SUBMITTED) — so its
 * completion is driven by `readyToSubmit` from the request's own documentReadiness, not status.
 */
function stepIndexFor(status, readyToSubmit) {
  if (status === 'APPLICATION_SUBMITTED') return readyToSubmit ? 1 : 0;
  if (PAYMENT_STATUSES.includes(status)) return 2;
  if (PROCESSING_STATUSES.includes(status)) return 3;
  if (status === 'COMPLETED') return 4;
  return -1; // REJECTED or unknown — caller shows a distinct banner instead
}

/** Legible Application -> Documents -> Payment -> Processing -> Completed progression. */
function VisaStepper({ status, readyToSubmit }) {
  const currentIndex = stepIndexFor(status, readyToSubmit);

  if (currentIndex === -1) return null;

  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => (
        <Fragment key={label}>
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
            <div
              className={cn(
                'flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold',
                i <= currentIndex ? 'bg-primary-600 text-white' : 'bg-neutral-200 text-neutral-500'
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                'text-center text-xs sm:text-sm',
                i <= currentIndex ? 'font-medium text-neutral-900' : 'text-neutral-400'
              )}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn('mx-2 h-0.5 flex-1', i < currentIndex ? 'bg-primary-600' : 'bg-neutral-200')} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

export default VisaStepper;
