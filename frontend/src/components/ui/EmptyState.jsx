import { cn } from '../../lib/cn';
import Icon from './Icon';

/**
 * The "nothing here yet" panel.
 *
 * An empty list is the state a new partner sees most often on their first login, so it's worth
 * designing rather than shipping a bare "No quotes." paragraph. The icon sits in a soft
 * concentric halo, and `action` is where the screen puts the one thing the user should do next.
 *
 * `compact` drops the padding for use inside an existing Card that already has its own.
 */
function EmptyState({ icon = 'sparkles', title, description, action, compact = false, className = '' }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl text-center',
        compact ? 'px-4 py-8' : 'surface-wash px-6 py-14',
        className
      )}
    >
      <span className="relative mb-4 flex size-12 items-center justify-center rounded-2xl bg-white text-primary-600 shadow-sm ring-1 ring-neutral-200">
        {/* Outer halo — purely decorative, gives the mark some air without another asset. */}
        <span
          aria-hidden="true"
          className="absolute -inset-2.5 rounded-[1.25rem] bg-primary-500/5 ring-1 ring-primary-500/10"
        />
        <Icon name={icon} size={22} />
      </span>

      <h3 className="text-[15px] font-semibold text-neutral-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-500">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
