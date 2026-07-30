import { useState } from 'react';
import Icon from './Icon';
import Input from './Input';

/**
 * Password field with a reveal toggle.
 *
 * Every password box in the app (login, registration, reset) previously offered no way to check
 * what had been typed, which is the most common cause of a failed login on a phone keyboard.
 * The toggle is a real <button> so it's keyboard reachable, and `tabIndex={-1}` is deliberately
 * NOT set — someone typing a password they can't see should be able to Tab straight to it.
 *
 * Takes every prop Input does; only `type` is owned by this component.
 */
function PasswordInput({ ...rest }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Input
      {...rest}
      type={revealed ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          title={revealed ? 'Hide password' : 'Show password'}
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <Icon name={revealed ? 'eye-off' : 'eye'} size={16} />
        </button>
      }
    />
  );
}

export default PasswordInput;
