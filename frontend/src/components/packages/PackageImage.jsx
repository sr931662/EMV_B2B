import { useState } from 'react';
import { cn } from '../../lib/cn';

/** Package gallery image with a graceful fallback — missing/broken URLs are common since
 * `gallery` is just a free-text URL array with no upload pipeline behind it. */
function PackageImage({ src, alt, className = '' }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-primary-100 to-neutral-100 text-primary-400',
          className
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-10 w-10"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 4.5h18M4.5 4.5v15A1.5 1.5 0 006 21h12a1.5 1.5 0 001.5-1.5v-15M9 9.75a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={cn('object-cover', className)}
    />
  );
}

export default PackageImage;
