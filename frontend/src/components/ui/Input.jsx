import { useId } from 'react';
import { cn } from '../../lib/cn';

/**
 * Labelled text input with inline error/help text. Uncontrolled or controlled — just a plain
 * <input> underneath, so it works with any form approach without pulling in a form library.
 */
function Input({ label, error, hint, className = '', id, required = false, ...rest }) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-danger-600"> *</span>}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(
          'rounded-lg border px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
          'disabled:bg-neutral-100 disabled:text-neutral-400',
          error ? 'border-danger-400' : 'border-neutral-300',
          className
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default Input;
