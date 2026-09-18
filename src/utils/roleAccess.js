export function normalizeUserRole(role) {
  const value = String(role ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!value) return 'foh';

  const aliases = {
    admin: 'admin',
    owner: 'admin',
    manager: 'manager',
    executive: 'executive',
    kitchen: 'kitchen',
    chef: 'kitchen',
    cook: 'kitchen',
    foh: 'foh',
    cashier: 'foh',
    frontdesk: 'foh',
    frontofhouse: 'foh',
    sales: 'foh',
    waiter: 'foh',
    server: 'foh',
    delivery: 'foh',
    rider: 'foh',
    staff: 'foh',
    masax: 'foh',
    adija: 'foh',
  };

  return aliases[value] || value;
}
