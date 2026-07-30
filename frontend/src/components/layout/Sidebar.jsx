import { NavLink } from 'react-router-dom';
import { Icon } from '../ui';
import Brand from './Brand';
import { cn } from '../../lib/cn';
import { navForRole, ROLE_LABELS } from '../../lib/navigation';

/**
 * The primary navigation rail. Rendered twice by AppLayout — once as the fixed desktop column,
 * once inside the mobile drawer — so it takes no responsibility for its own positioning.
 *
 * Styling notes:
 *  - Dark chrome (`surface-deep`) is the frame that makes the white content area read as the
 *    document being worked on. It also replaces the old "admin gets a dark bar" cue with
 *    something consistent for every role, since the role is now labelled explicitly below the
 *    wordmark instead of implied by colour.
 *  - The active item is a translucent white plate with a brand-coloured left marker rather than
 *    a solid fill: on a dark ground a solid light fill is loud enough to pull the eye away from
 *    the actual content.
 *  - `badges` maps a nav item's `badge` key to a live count (currently the admin's pending
 *    payment queue). AppLayout owns the polling so mounting this twice doesn't double it.
 */
function Sidebar({ role, user, badges = {}, onNavigate, onLogout }) {
  const sections = navForRole(role);

  return (
    <div className="surface-deep flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <Brand tone="light" imgClassName="h-8" />
      </div>

      <div className="mx-5 h-px shrink-0 bg-white/10" />

      {/* Role marker */}
      <div className="px-5 pb-1 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-300/70">
          {ROLE_LABELS[role] ?? 'Workspace'}
        </p>
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {sections.map((section, sectionIndex) => (
          <div key={section.label ?? sectionIndex} className={cn(sectionIndex > 0 && 'mt-6')}>
            {section.label && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                {section.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const count = item.badge ? badges[item.badge] : 0;

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                          'transition-colors duration-150',
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Left marker on the active item. */}
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity',
                              isActive ? 'bg-primary-300 opacity-100' : 'opacity-0'
                            )}
                          />
                          <Icon
                            name={item.icon}
                            size={17}
                            className={cn(
                              'transition-colors',
                              isActive ? 'text-primary-200' : 'text-white/45 group-hover:text-white/80'
                            )}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {count > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1.5 text-[10px] font-semibold tabular-nums text-white ring-1 ring-inset ring-white/20">
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account footer. Duplicates the topbar user menu on purpose: on a tall desktop screen the
       * account lives at the bottom of the rail where people look for it, and inside the mobile
       * drawer it is the only place a logout control appears. */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-500/25 text-[11px] font-semibold uppercase text-primary-100 ring-1 ring-inset ring-white/15">
            {(user?.email ?? '?').slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white/90">
              {user?.partnerProfile?.companyName ?? user?.email ?? 'Signed in'}
            </span>
            {user?.partnerProfile?.companyName && (
              <span className="block truncate text-[11px] text-white/45">{user.email}</span>
            )}
          </span>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="shrink-0 rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
