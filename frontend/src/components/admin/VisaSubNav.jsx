import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

const ITEMS = [
  { to: '/admin/visa-requests', label: 'Requests' },
  { to: '/admin/visa-config', label: 'Configuration' },
];

/** Two-tab switcher shared by the visa requests queue and visa config pages — the admin nav
 * only has one "Visa" entry, so this is how the two areas link to each other. */
function VisaSubNav() {
  return (
    <div className="flex gap-1 border-b border-neutral-200">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default VisaSubNav;
