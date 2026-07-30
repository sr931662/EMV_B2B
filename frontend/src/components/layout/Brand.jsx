import { useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * The wordmark. Falls back to a text lockup if /logo.png fails to load — that fallback already
 * existed in both layouts, duplicated; this is the one copy.
 *
 * `tone="light"` is for the dark sidebar/auth panel, `tone="dark"` for white surfaces. The logo
 * image itself is tone-agnostic, so only the fallback text needs to switch.
 */
function Brand({ tone = 'dark', className = '', imgClassName = 'h-9' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          'text-sm font-semibold tracking-widest',
          tone === 'light' ? 'text-white' : 'text-neutral-900',
          className
        )}
      >
        TRAVNEXA GLOBAL
      </span>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="TravNexa Global"
      onError={() => setFailed(true)}
      className={cn('w-auto object-contain', imgClassName, className)}
    />
  );
}

export default Brand;
