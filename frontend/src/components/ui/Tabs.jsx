import { cn } from '../../lib/cn';
import Icon from './Icon';

/**
 * State-driven segmented control for in-page tabs.
 *
 * Matches VisaSubNav's look, but VisaSubNav is route-driven (NavLink) while this one is driven by
 * local state — same visual language, different mechanism, so they stay separate components rather
 * than one over-configurable thing.
 *
 * Implements the ARIA tab pattern (`role="tablist"`/`role="tab"` + `aria-selected`) and arrow-key
 * navigation, which a row of plain <button>s doesn't give screen readers.
 */
function Tabs({ tabs, value, onChange, className = '' }) {
  const handleKeyDown = (e) => {
    const currentIndex = tabs.findIndex((t) => t.key === value);
    if (currentIndex === -1) return;

    let nextIndex = null;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      onChange(tabs[nextIndex].key);
    }
  };

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        // Scrolls rather than wraps on narrow screens: a segmented control that reflows onto two
        // rows stops reading as one control.
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-neutral-150 p-1 ring-1 ring-inset ring-neutral-200/70',
        className
      )}
    >
      {tabs.map((t) => {
        const isActive = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              isActive
                ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-200'
                : 'text-neutral-500 hover:text-neutral-800'
            )}
          >
            {t.icon && <Icon name={t.icon} size={15} />}
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  'rounded px-1.5 text-[11px] tabular-nums',
                  isActive ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-200/70 text-neutral-500'
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
