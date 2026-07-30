import { useId } from 'react';
import { cn } from '../../lib/cn';

/** Labelled <textarea>, styled to match Input. */
function Textarea({ label, error, hint, className = '', id, required = false, rows = 3, ...rest }) {
  const generatedId = useId();
  const textareaId = id || generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-danger-600"> *</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
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
        <p id={`${textareaId}-error`} className="text-sm text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${textareaId}-hint`} className="text-sm text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default Textarea;
