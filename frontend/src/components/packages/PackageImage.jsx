import { useState } from 'react';
import { cn } from '../../lib/cn';
import { Icon } from '../ui';

/**
 * Package gallery image with a graceful fallback — missing/broken URLs are common since `gallery`
 * is just a free-text URL array with no upload pipeline behind it.
 *
 * The fallback is a brand-tinted panel with a faint repeating pattern rather than a grey box with
 * a broken-image glyph: on a marketplace grid where several packages may have no imagery, an
 * obviously-intentional placeholder keeps the page looking finished.
 */
function PackageImage({ src, alt, className = '' }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden',
          'bg-gradient-to-br from-primary-100 via-primary-50 to-accent-50 text-primary-400/70',
          className
        )}
      >
        {/* Faint diagonal hatch — reads as a designed surface, not a loading failure. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 9px)',
          }}
        />
        <Icon name="map-pin" size={30} className="relative" />
      </div>
    );
  }

  return <img src={src} alt={alt} onError={() => setErrored(true)} className={cn('object-cover', className)} />;
}

export default PackageImage;
