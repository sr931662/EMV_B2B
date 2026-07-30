import { useId } from 'react';
import { cn } from '../../lib/cn';
import Icon from './Icon';
import { FIELD_BASE, FIELD_TONE, FieldLabel, FieldMessage } from './Input';

/**
 * Labelled <select>. Pass `options={[{value, label}]}` for the common case, or plain <option>
 * children for anything more custom (grouped options, etc).
 *
 * The native chevron is suppressed (`appearance-none`) and replaced with our own icon: the OS
 * arrow is a different shape and colour on every platform, which is one of the loudest visual
 * inconsistencies in an otherwise designed form.
 */
function Select({ label, error, hint, options, className = '', id, required = false, children, ...rest }) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const messageId = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <FieldLabel htmlFor={selectId} required={required}>
          {label}
        </FieldLabel>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={messageId}
          className={cn(
            FIELD_BASE,
            'h-10 cursor-pointer appearance-none pl-3 pr-9',
            error ? FIELD_TONE.error : FIELD_TONE.normal,
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
        <Icon
          name="chevron-down"
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export default Select;
