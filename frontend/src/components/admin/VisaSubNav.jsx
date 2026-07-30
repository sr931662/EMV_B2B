import { NavLink } from 'react-router-dom';
import { Icon } from '../ui';
import { cn } from '../../lib/cn';

const ITEMS = [
  { to: '/admin/visa-requests', label: 'Requests', icon: 'plane' },
  { to: '/admin/visa-config', label: 'Configuration', icon: 'sliders' },
];

/**
 * Two-tab switcher shared by the visa requests queue and visa config pages — the sidebar only has
 * one "Visa Requests" entry, so this is how the two areas link to each other.
 *
 * Rendered as a segmented control on a tinted track rather than underlined tabs: with only two
 * options the pill form makes the inactive one obviously clickable, which underlines don't.
 */
function VisaSubNav() {
  return (
    <div className="inline-flex w-fit gap-1 rounded-xl bg-neutral-150 p-1 ring-1 ring-inset ring-neutral-200/70">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              isActive
                ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-200'
                : 'text-neutral-500 hover:text-neutral-800'
            )
          }
        >
          <Icon name={item.icon} size={15} />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default VisaSubNav;
