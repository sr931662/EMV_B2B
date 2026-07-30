/**
 * Single source of truth for the primary navigation, keyed by role.
 *
 * Previously the partner had no nav at all (only the buttons a page happened to render) and the
 * admin's links lived inline in AdminNav. Centralising them means the sidebar, the mobile drawer
 * and any future command palette all read the same list.
 *
 * `end: true` mirrors react-router's NavLink prop — needed on index routes like /admin and
 * /dashboard, which would otherwise stay highlighted on every nested page beneath them.
 *
 * Every route registered in App.jsx for a role appears here, so no destination is unreachable
 * from the chrome. `/library` is intentionally listed for admin as well as data_feeder: admins
 * have always been authorised for it (see the RequireAuth roles in App.jsx) but the old nav
 * never linked it.
 */

const PARTNER_NAV = [
  {
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/packages', label: 'Packages', icon: 'package' },
      { to: '/visa', label: 'Visa Services', icon: 'plane' },
      { to: '/quotes', label: 'My Quotes', icon: 'receipt' },
    ],
  },
];

const ADMIN_NAV = [
  {
    label: 'Operations',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/admin/payments', label: 'Payments', icon: 'card', badge: 'pendingPayments' },
      { to: '/admin/agencies', label: 'Agencies', icon: 'building' },
      { to: '/admin/packages', label: 'Packages', icon: 'package' },
      { to: '/admin/visa-requests', label: 'Visa Requests', icon: 'plane' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/library', label: 'Library', icon: 'layers' },
      { to: '/admin/staff', label: 'Staff', icon: 'users' },
      { to: '/admin/templates', label: 'Email Templates', icon: 'mail' },
      { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    ],
  },
];

const DATA_FEEDER_NAV = [
  {
    items: [{ to: '/library', label: 'Library', icon: 'layers' }],
  },
];

const NAV_BY_ROLE = {
  partner: PARTNER_NAV,
  admin: ADMIN_NAV,
  data_feeder: DATA_FEEDER_NAV,
};

/** Nav sections for a role. Unknown/absent role gets an empty rail rather than throwing. */
export function navForRole(role) {
  return NAV_BY_ROLE[role] ?? [];
}

/** Human-readable role label for the sidebar/user menu. */
export const ROLE_LABELS = {
  partner: 'Partner',
  admin: 'Administrator',
  data_feeder: 'Data Feeder',
};

export { NAV_BY_ROLE };
