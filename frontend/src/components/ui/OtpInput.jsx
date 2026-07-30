import { useRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * Segmented numeric OTP input. `value`/`onChange` carry the whole code as one string (e.g.
 * "123456") so callers can treat it like any other controlled field — the per-box splitting
 * is an internal rendering detail. Handles paste of the full code into any box.
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
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
      <div className="flex justify-between gap-2">
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
            aria-label={`Digit ${i + 1}`}
            className={cn(
              'h-12 w-full max-w-12 rounded-lg border text-center text-lg font-semibold text-neutral-900',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
              'disabled:bg-neutral-100 disabled:text-neutral-400',
              error ? 'border-danger-400' : 'border-neutral-300'
            )}
          />
        ))}
      </div>
      {error && <p className="text-sm text-danger-600">{error}</p>}
    </div>
  );
}

export default OtpInput;
