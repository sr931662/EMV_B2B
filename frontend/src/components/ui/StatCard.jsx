import { cn } from '../../lib/cn';
import Icon from './Icon';

const TONES = {
  neutral: 'bg-neutral-100 text-neutral-500 ring-neutral-200',
  primary: 'bg-primary-50 text-primary-600 ring-primary-100',
  accent: 'bg-accent-50 text-accent-600 ring-accent-200',
  success: 'bg-success-50 text-success-600 ring-success-200',
  warning: 'bg-warning-50 text-warning-600 ring-warning-200',
  danger: 'bg-danger-50 text-danger-600 ring-danger-200',
  info: 'bg-info-50 text-info-600 ring-info-200',
};

/**
 * Dashboard stat tile: a big number, a label, and optional small breakdown content below.
 *
 * Built as its own surface rather than wrapping <Card> so the value can be the visual anchor —
 * a stat tile wants tighter padding and a taller number than a content card's defaults. `icon`
 * and `tone` are additive; callers that pass neither still get the plain tile.
 *
 * `tabular-nums` on the value keeps a row of tiles from jittering as numbers change width.
 */
function StatCard({ label, value, hint, icon, tone = 'neutral', children, className = '' }) {
  return (
    <div
      className={cn(
        'surface group relative flex flex-col gap-1 rounded-xl p-4',
        'transition-shadow duration-200 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              TONES[tone] ?? TONES.neutral
            )}
          >
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>

      <span className="text-[26px] font-semibold leading-tight tracking-tight text-neutral-900 tabular-nums">
        {value}
      </span>

      {hint && <span className="text-[13px] leading-snug text-neutral-500">{hint}</span>}
      {children}
    </div>
  );
}

export default StatCard;
