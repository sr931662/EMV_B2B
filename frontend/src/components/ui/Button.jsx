import { cn } from '../../lib/cn';
import Spinner from './Spinner';

const VARIANTS = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus-visible:outline-primary-600 disabled:bg-primary-300',
  secondary:
    'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 focus-visible:outline-neutral-400 disabled:text-neutral-400',
  outline:
    'border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 focus-visible:outline-primary-600 disabled:text-neutral-300',
  ghost: 'text-neutral-600 hover:bg-neutral-100 focus-visible:outline-neutral-400 disabled:text-neutral-300',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 focus-visible:outline-danger-600 disabled:bg-danger-300',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

/**
 * Base button used everywhere in the app. `loading` disables the button and swaps in a
 * Spinner while keeping the label's width reserved (via `invisible`), so a click doesn't
 * reflow the layout.
 */
function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <Component
      type={Component === 'button' ? type : undefined}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        'relative inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" className={variant === 'primary' || variant === 'danger' ? 'border-white/30 border-t-white' : ''} />
        </span>
      )}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>{children}</span>
    </Component>
  );
}

export default Button;
