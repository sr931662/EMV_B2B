import { cn } from '../../lib/cn';

const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-5 border-2',
  lg: 'size-8 border-[2.5px]',
};

/**
 * Spinning-ring loader. `label` is for screen readers only (visually hidden).
 *
 * The track is a translucent version of the brand colour rather than solid grey, so the ring
 * reads as one object rotating instead of two concentric circles of unrelated colours.
 */
function Spinner({ size = 'md', className = '', label = 'Loading' }) {
  return (
    <span
      role="status"
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full',
        'border-primary-600/20 border-t-primary-600',
        SIZES[size] ?? SIZES.md,
        className
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default Spinner;
