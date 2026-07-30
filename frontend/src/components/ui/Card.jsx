import { cn } from '../../lib/cn';

/** Plain content container. `title`/`actions` render an optional header row above `children`. */
function Card({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <div className={cn('rounded-xl border border-neutral-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          {title && <h3 className="text-base font-semibold text-neutral-900">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export default Card;
