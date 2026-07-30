import { passwordStrength } from '../../lib/validators';
import { cn } from '../../lib/cn';

const COLORS = ['bg-danger-500', 'bg-warning-500', 'bg-info-500', 'bg-success-500'];

/** Tiny 4-segment strength bar shown under a password field once the user starts typing. */
function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const { label, score } = passwordStrength(password);

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={cn('h-1.5 flex-1 rounded-full', i < score ? COLORS[score - 1] : 'bg-neutral-200')}
          />
        ))}
      </div>
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

export default PasswordStrengthMeter;
