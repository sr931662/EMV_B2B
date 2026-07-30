import { useId } from 'react';
import { cn } from '../../lib/cn';

/**
 * Labelled <select>. Pass `options={[{value, label}]}` for the common case, or plain <option>
 * children for anything more custom (grouped options, etc).
 */
function Select({ label, error, hint, options, className = '', id, required = false, children, ...rest }) {
  const generatedId = useId();
  const selectId = id || generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-danger-600"> *</span>}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
        className={cn(
          'rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
          'disabled:bg-neutral-100 disabled:text-neutral-400',
          error ? 'border-danger-400' : 'border-neutral-300',
          className
        )}
        {...rest}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="text-sm text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="text-sm text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default Select;
