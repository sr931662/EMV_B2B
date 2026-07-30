import { cn } from '../../lib/cn';

/**
 * Plain content container. `title`/`actions` render an optional header row above `children`.
 *
 * Elevation comes from the shared `.surface` class (see src/index.css) rather than local
 * utilities, so cards, modals and popovers can never drift into three different shadow
 * languages. `subtitle` and `icon` are additive — existing callers pass neither.
 */
function Card({ title, subtitle, icon, actions, children, className = '', bodyClassName = '' }) {
  const hasHeader = Boolean(title || actions || subtitle);

  return (
    <div className={cn('surface overflow-hidden rounded-xl', className)}>
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="truncate text-[15px] font-semibold text-neutral-900">{title}</h3>
              )}
              {subtitle && <p className="truncate text-[13px] text-neutral-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export default Card;
