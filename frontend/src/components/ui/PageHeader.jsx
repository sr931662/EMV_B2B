import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import Icon from './Icon';

/**
 * The standard top-of-page block: optional back link, an eyebrow label, the H1, a one-line
 * description, and a right-aligned action cluster.
 *
 * Every screen previously hand-rolled some variation of
 * `<div className="flex justify-between"><h1 className="text-2xl …">`, which is why page titles
 * drifted in size and spacing across the app. Routing all of them through one component is what
 * makes the product feel like a single surface rather than 40 separate screens.
 *
 * On narrow viewports the actions wrap onto their own row below the title instead of squeezing
 * it — a truncated page title is much worse than a taller header.
 */
function PageHeader({ title, subtitle, eyebrow, actions, backTo, backLabel = 'Back', className = '' }) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {backTo && (
        <Link
          to={backTo}
          className={cn(
            'group -ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5',
            'text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700'
          )}
        >
          <Icon
            name="arrow-left"
            size={15}
            className="transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary-600">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[22px] font-semibold leading-tight text-neutral-900 sm:text-[26px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-500">{subtitle}</p>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
