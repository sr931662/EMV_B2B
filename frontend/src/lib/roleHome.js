export const ROLE_HOME = {
  partner: '/dashboard',
  admin: '/admin',
  data_feeder: '/library',
};

export const roleHome = (role) => ROLE_HOME[role] ?? '/login';
