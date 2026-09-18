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

export function normalizeRoleName(role) {
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
    'head of operations': 'manager',
  };

  return aliases[normalized] || normalized;
}

export function normalizeUserRole(role) {
  return normalizeRoleName(role);
}

export function normalizePagePath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash;
}

export function normalizePageAccess(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value || '[]') : [];
  if (!Array.isArray(raw)) return [];

  const normalized = [];
  for (const item of raw) {
    const path = normalizePagePath(item);
    if (path && VALID_PAGE_PATHS.has(path) && !normalized.includes(path)) normalized.push(path);
  }
  return normalized;
}

export function normalizeCustomRole(role) {
  if (!role || typeof role !== 'object') return null;
  const name = String(role.name ?? role.label ?? '').trim();
  if (!name) return null;

  const sanitizedName = name.replace(/\s+/g, ' ');
  const baseRole = normalizeRoleName(role.baseRole || role.role || 'foh');
  return {
    name: sanitizedName,
    label: String(role.label ?? role.name ?? sanitizedName).trim() || sanitizedName,
    baseRole: Object.prototype.hasOwnProperty.call(ROUTE_ACCESS, baseRole) ? baseRole : 'foh',
  };
}

export function getRolePageAccess(input) {
  const candidate = input && typeof input === 'object' ? input : { role: input, pageAccess: [] };
  const explicit = normalizePageAccess(candidate.pageAccess ?? candidate.page_access ?? []);
  const baseRole = normalizeRoleName(candidate.baseRole || candidate.role || 'foh');
  const fallback = ROUTE_ACCESS[baseRole] || ROUTE_ACCESS.foh;

  if (explicit.length > 0) {
    const allowed = explicit.filter((path) => fallback.includes(path));
    return allowed.length ? allowed : [...fallback];
  }

  return [...fallback];
}

export function getCustomRoleEntries(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.flatMap((role) => {
      const normalized = normalizeCustomRole(role);
      return normalized ? [normalized] : [];
    });
    const deduped = new Map();
    for (const entry of entries) {
      deduped.set(entry.name.toLowerCase(), entry);
    }
    return [...deduped.values()];
  } catch {
    return [];
  }
}
