export const ROUTE_ACCESS = {
  admin: [
    '/pos', '/pos/payment', '/pos/success', '/pos/tables',
    '/orders', '/management/payments', '/kds', '/crm', '/crm/whatsapp',
    '/analytics', '/management/menu', '/management/operations',
    '/management/reports', '/assistant', '/management/people',
    '/management/loyalty', '/management/campaigns', '/management/kanban',
    '/management/settings', '/notifications',
  ],
  manager: [
    '/orders', '/management/payments', '/crm', '/crm/whatsapp',
    '/analytics', '/management/menu', '/management/operations',
    '/assistant', '/management/loyalty', '/management/campaigns',
    '/management/kanban', '/notifications',
  ],
  executive: [
    '/crm', '/crm/whatsapp', '/analytics', '/management/operations',
    '/management/reports', '/assistant', '/management/campaigns',
    '/management/kanban',
  ],
  kitchen: ['/kds', '/assistant'],
  foh: ['/pos', '/pos/payment', '/pos/success', '/pos/tables', '/orders', '/management/payments', '/assistant', '/notifications'],
};

const VALID_PAGE_PATHS = new Set(Object.values(ROUTE_ACCESS).flat());

export function normalizeUserRole(role) {
  const value = String(role ?? '').trim();
  if (!value) return 'foh';

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'foh';

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
    'front desk': 'foh',
    frontofhouse: 'foh',
    sales: 'foh',
    waiter: 'foh',
    server: 'foh',
    delivery: 'foh',
    rider: 'foh',
    staff: 'foh',
    masax: 'foh',
    adija: 'foh',
    'head chef': 'kitchen',
    'kitchen staff': 'kitchen',
  };

  return aliases[normalized] || normalized;
}

export function normalizePagePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function normalizePageAccess(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value || '[]') : [];
  if (!Array.isArray(raw)) return [];
  const next = [];
  for (const item of raw) {
    const path = normalizePagePath(item);
    if (path && VALID_PAGE_PATHS.has(path) && !next.includes(path)) next.push(path);
  }
  return next;
}

export function getRolePageAccess(input = {}) {
  const candidate = input && typeof input === 'object' ? input : { role: input, pageAccess: [] };
  const baseRole = normalizeUserRole(candidate.baseRole || candidate.role || 'foh');
  const fallback = ROUTE_ACCESS[baseRole] || ROUTE_ACCESS.foh;
  const explicit = normalizePageAccess(candidate.pageAccess ?? candidate.page_access ?? []);
  if (explicit.length > 0) {
    const filtered = explicit.filter((path) => fallback.includes(path));
    return filtered.length > 0 ? filtered : [...fallback];
  }
  return [...fallback];
}

export function getUserPageAccess(user = {}) {
  const role = normalizeUserRole(user.role);
  const explicit = normalizePageAccess(user.pageAccess ?? user.page_access ?? []);
  if (explicit.length > 0) {
    const allowed = explicit.filter((path) => (ROUTE_ACCESS[role] || ROUTE_ACCESS.foh).includes(path));
    if (allowed.length > 0) return allowed;
  }
  return getRolePageAccess({ role, pageAccess: [] });
}

export function isPageAllowedForUser(user, path) {
  const normalizedPath = normalizePagePath(path);
  if (!normalizedPath) return false;
  const allowed = getUserPageAccess(user);
  return allowed.includes(normalizedPath);
}
