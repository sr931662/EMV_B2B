import { useRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * Segmented numeric OTP input. `value`/`onChange` carry the whole code as one string (e.g.
 * "123456") so callers can treat it like any other controlled field — the per-box splitting is
 * an internal rendering detail. Handles paste of the full code into any box.
 *
 * Boxes are square with a large centred glyph: an OTP is the one field where an oversized,
 * confident target is the right call, because it's the highest-stakes single interaction in the
 * signup flow. A filled box gets a brand-tinted border so progress through the code is visible
 * at a glance.
 */
function OtpInput({ length = 6, value, onChange, error, disabled, label }) {
  const inputsRef = useRef([]);
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  const commit = (nextDigits) => onChange(nextDigits.join('').slice(0, length));

  const handleChange = (index, e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');

    if (!raw) {
      const next = digits.slice();
      next[index] = '';
      commit(next);
      return;
    }

    const chars = raw.split('');
    const next = digits.slice();
    for (let i = 0; i < chars.length && index + i < length; i += 1) {
      next[index + i] = chars[i];
    }
    commit(next);

    const lastIndex = Math.min(index + chars.length, length - 1);
    inputsRef.current[lastIndex]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-[13px] font-medium text-neutral-700">{label}</span>}
      <div className="flex justify-center gap-2 sm:gap-2.5">
        {digits.map((digit, i) => (
          <input
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            value={digit}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={length}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={Boolean(error) || undefined}
            className={cn(
              'size-11 rounded-xl bg-white text-center text-lg font-semibold text-neutral-900 tabular-nums sm:size-12 sm:text-xl',
              'shadow-xs ring-1 ring-inset transition-shadow duration-150',
              'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-600 focus:shadow-focus',
              'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none',
              error
                ? 'ring-danger-300'
                : digit
                  ? 'ring-primary-300'
                  : 'ring-neutral-300 hover:ring-neutral-400'
            )}
          />
        ))}
      </div>
      {error && <p className="text-center text-[13px] font-medium text-danger-600">{error}</p>}
    </div>
  );
}

export default OtpInput;
