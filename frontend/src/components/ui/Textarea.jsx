import { useId } from 'react';
import { cn } from '../../lib/cn';
import { FIELD_BASE, FIELD_TONE, FieldLabel, FieldMessage } from './Input';

/** Labelled <textarea>. Shares Input's exact box treatment so stacked fields stay aligned. */
function Textarea({ label, error, hint, className = '', id, required = false, rows = 3, ...rest }) {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const messageId = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <FieldLabel htmlFor={textareaId} required={required}>
          {label}
        </FieldLabel>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={messageId}
        className={cn(
          FIELD_BASE,
          'px-3 py-2.5 leading-relaxed',
          // Only vertical resize: horizontal dragging breaks every grid this sits inside.
          'resize-y',
          error ? FIELD_TONE.error : FIELD_TONE.normal,
          className
        )}
        {...rest}
      />
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export default Textarea;
