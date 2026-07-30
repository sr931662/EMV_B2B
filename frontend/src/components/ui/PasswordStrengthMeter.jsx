import { passwordStrength } from '../../lib/validators';
import { cn } from '../../lib/cn';

const COLORS = ['bg-danger-500', 'bg-warning-500', 'bg-info-500', 'bg-success-500'];
const LABEL_COLORS = ['text-danger-600', 'text-warning-700', 'text-info-600', 'text-success-600'];

/**
 * Tiny 4-segment strength bar shown under a password field once the user starts typing.
 *
 * Segments animate their fill so the bar reads as filling up rather than flickering between
 * states, and the label picks up the same colour as the bar for a single, unambiguous signal.
 */
function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const { label, score } = passwordStrength(password);

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < score ? COLORS[score - 1] : 'bg-neutral-200'
            )}
          />
        ))}
      </div>
      <span className={cn('w-14 shrink-0 text-right text-[11px] font-semibold', LABEL_COLORS[score - 1] ?? 'text-neutral-500')}>
        {label}
      </span>
    </div>
  );
}

export default PasswordStrengthMeter;
