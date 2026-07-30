import { useId } from 'react';
import { cn } from '../../lib/cn';

/**
 * Accessible on/off switch for boolean list filters ("Show archived").
 *
 * Built on a real checkbox kept visually hidden but still focusable (`sr-only` + `peer`), so
 * keyboard activation, form semantics and screen-reader state come free — a div with
 * role="switch" and an onClick would have to reimplement all three.
 *
 * The input, track and knob are *direct siblings* inside the relative wrapper: `peer-checked:`
 * compiles to a general sibling selector (`~`), so a knob nested inside the track would never
 * receive the checked state. The knob is offset with `top-0.5` rather than a vertical translate so
 * that `translate-x` is the only transform on it and the two can't fight.
 */
function Switch({ checked, onChange, label, hint, disabled = false, id, className = '' }) {
  const generatedId = useId();
  const switchId = id || generatedId;

  return (
    <label
      htmlFor={switchId}
      className={cn(
        'group inline-flex items-center gap-2.5',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className
      )}
    >
      <span className="relative inline-block h-5 w-9 shrink-0">
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 rounded-full bg-neutral-300 transition-colors duration-200',
            'ring-1 ring-inset ring-neutral-900/5',
            'peer-checked:bg-primary-600',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60',
            !disabled && 'group-hover:bg-neutral-400 peer-checked:group-hover:bg-primary-700'
          )}
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4"
        />
      </span>

      {(label || hint) && (
        <span className="flex flex-col leading-tight">
          {label && <span className="text-[13px] font-medium text-neutral-700">{label}</span>}
          {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export default Switch;
