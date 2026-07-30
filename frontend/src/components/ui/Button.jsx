import { cn } from '../../lib/cn';
import Spinner from './Spinner';

/*
 * Variant surfaces. Two details do most of the work for a premium feel:
 *
 *  1. A near-invisible inset top highlight on filled variants — it implies a light source and
 *     stops the button reading as a flat colour rectangle.
 *  2. Ring-based borders (`ring-1 ring-inset`) instead of `border`, so a border never changes
 *     the box size between variants and rows of mixed buttons stay pixel-aligned.
 */
const VARIANTS = {
  primary: cn(
    'bg-primary-600 text-white shadow-sm ring-1 ring-inset ring-primary-700/40',
    'hover:bg-primary-700 active:bg-primary-800',
    'disabled:bg-primary-600/40 disabled:ring-transparent disabled:shadow-none'
  ),
  secondary: cn(
    'bg-neutral-900 text-white shadow-sm ring-1 ring-inset ring-white/10',
    'hover:bg-neutral-800 active:bg-neutral-950',
    'disabled:bg-neutral-900/40 disabled:shadow-none'
  ),
  outline: cn(
    'bg-white text-neutral-700 shadow-xs ring-1 ring-inset ring-neutral-300',
    'hover:bg-neutral-50 hover:text-neutral-900',
    'active:bg-neutral-100',
    'disabled:bg-white disabled:text-neutral-300 disabled:ring-neutral-200 disabled:shadow-none'
  ),
  ghost: cn(
    'text-neutral-600',
    'hover:bg-neutral-150 hover:text-neutral-900 active:bg-neutral-200',
    'disabled:bg-transparent disabled:text-neutral-300'
  ),
  danger: cn(
    'bg-danger-600 text-white shadow-sm ring-1 ring-inset ring-danger-700/40',
    'hover:bg-danger-700 active:bg-danger-700',
    'disabled:bg-danger-600/40 disabled:ring-transparent disabled:shadow-none'
  ),
  success: cn(
    'bg-success-600 text-white shadow-sm ring-1 ring-inset ring-success-700/40',
    'hover:bg-success-700 active:bg-success-700',
    'disabled:bg-success-600/40 disabled:ring-transparent disabled:shadow-none'
  ),
};

// Fixed heights rather than vertical padding: a button then lines up exactly with an Input or
// Select of the same size, which padding-based sizing never quite manages.
const SIZES = {
  sm: 'h-8 px-3 text-[13px] rounded-lg',
  md: 'h-10 px-4 text-sm rounded-lg',
  lg: 'h-11 px-5 text-[15px] rounded-xl',
};

const GAPS = { sm: 'gap-1.5', md: 'gap-2', lg: 'gap-2' };

const LIGHT_ON_DARK = new Set(['primary', 'secondary', 'danger', 'success']);

/**
 * Base button used everywhere in the app. `loading` disables the button and swaps in a Spinner
 * while keeping the label's width reserved (via `invisible`), so a click never reflows layout.
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
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,box-shadow,color,transform] duration-150',
        // 1px of press travel reads as physical feedback; any more looks like a bug.
        'active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:active:translate-y-0',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" className={LIGHT_ON_DARK.has(variant) ? 'border-white/30 border-t-white' : ''} />
        </span>
      )}
      <span className={cn('inline-flex items-center', GAPS[size] ?? GAPS.md, loading && 'invisible')}>
        {children}
      </span>
    </Component>
  );
}

export default Button;
