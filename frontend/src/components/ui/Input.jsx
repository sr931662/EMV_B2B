import { useId } from 'react';
import { cn } from '../../lib/cn';
import Icon from './Icon';

/*
 * Shared field chrome. Exported so Select/Textarea/PasswordInput reuse the exact same box
 * treatment — three near-identical copies of these classes is how form controls drift out of
 * alignment.
 *
 * The focus state uses a *ring* rather than a colour-only border change: a 3px translucent brand
 * halo is legible at a glance and doesn't shift layout by a pixel.
 */
const FIELD_BASE = cn(
  'w-full rounded-lg bg-white text-sm text-neutral-900 shadow-xs',
  'ring-1 ring-inset transition-shadow duration-150',
  'placeholder:text-neutral-400',
  'focus:outline-none focus:ring-2 focus:ring-inset',
  'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none',
  'read-only:bg-neutral-50'
);

const FIELD_TONE = {
  normal: 'ring-neutral-300 hover:ring-neutral-400 focus:ring-primary-600 focus:shadow-focus',
  error: 'ring-danger-300 hover:ring-danger-400 focus:ring-danger-600',
};

/** Label + required marker, shared by all field components. */
function FieldLabel({ htmlFor, children, required }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-neutral-700">
      {children}
      {required && (
        <span className="ml-0.5 text-danger-600" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

/** Inline error (with icon) or hint text below a field. */
function FieldMessage({ id, error, hint }) {
  if (error) {
    return (
      <p id={id} className="flex items-start gap-1.5 text-[13px] font-medium text-danger-600">
        <Icon name="alert-triangle" size={14} className="mt-0.5" />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="text-[13px] text-neutral-500">
        {hint}
      </p>
    );
  }
  return null;
}

/**
 * Labelled text input with inline error/help text. Uncontrolled or controlled — a plain <input>
 * underneath, so it works with any form approach without a form library.
 *
 * `leading`/`trailing` render adornments inside the field box (an icon, a unit, a reveal button)
 * and the input's padding is adjusted to match, so content can never sit under them.
 */
function Input({
  label,
  error,
  hint,
  className = '',
  id,
  required = false,
  leading,
  trailing,
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const messageId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <FieldLabel htmlFor={inputId} required={required}>
          {label}
        </FieldLabel>
      )}

      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            {leading}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={messageId}
          className={cn(
            FIELD_BASE,
            'h-10',
            leading ? 'pl-9' : 'pl-3',
            trailing ? 'pr-10' : 'pr-3',
            error ? FIELD_TONE.error : FIELD_TONE.normal,
            className
          )}
          {...rest}
        />
        {trailing && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>
        )}
      </div>

      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export default Input;
export { FIELD_BASE, FIELD_TONE, FieldLabel, FieldMessage };
