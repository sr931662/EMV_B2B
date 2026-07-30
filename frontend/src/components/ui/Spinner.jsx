import { cn } from '../../lib/cn';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

/** Simple spinning-ring loader. `label` is for screen readers only (visually hidden). */
function Spinner({ size = 'md', className = '', label = 'Loading' }) {
  return (
    <span
      role="status"
      className={cn(
        'inline-block animate-spin rounded-full border-neutral-200 border-t-primary-600',
        SIZES[size],
        className
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default Spinner;
