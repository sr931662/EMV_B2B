import { Fragment } from 'react';
import { cn } from '../../lib/cn';

const STEPS = ['Quote Generated', 'Customer Approved', 'Payment & Booking'];

const PAYMENT_STAGE_STATUSES = [
  'PAYMENT_SUBMITTED',
  'PENDING_VERIFICATION',
  'BOOKING_CONFIRMED',
  'ORDER_COMPLETED',
];

function stepIndexFor(status) {
  if (status === 'QUOTE_GENERATED') return 0;
  if (status === 'CUSTOMER_APPROVED') return 1;
  if (PAYMENT_STAGE_STATUSES.includes(status)) return 2;
  return -1; // REJECTED or unknown — caller shows a distinct banner instead
}

/** Legible Quote -> Approve -> Pay progression for the quote detail page. */
function QuoteStepper({ status }) {
  const currentIndex = stepIndexFor(status);

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

export default QuoteStepper;
