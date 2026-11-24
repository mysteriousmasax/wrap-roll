export const ROUTE_ACCESS = {
  admin: [
    '/pos', '/pos/payment', '/pos/success', '/pos/tables',
    '/orders', '/customers', '/roadside', '/management/payments', '/kds', '/crm', '/crm/whatsapp',
    '/analytics', '/management/menu', '/management/operations',
    '/staff-playbook', '/management/reports', '/assistant', '/management/people',
    '/management/loyalty', '/management/campaigns', '/management/kanban',
    '/management/settings', '/management/email-marketing', '/notifications',
  ],
  manager: [
    '/orders', '/customers', '/roadside', '/management/payments', '/crm', '/crm/whatsapp',
    '/analytics', '/management/menu', '/management/operations',
    '/staff-playbook', '/management/reports', '/assistant', '/management/loyalty', '/management/campaigns',
    '/management/email-marketing', '/management/kanban', '/notifications',
  ],
  executive: [
    '/crm', '/crm/whatsapp', '/analytics', '/management/operations',
    '/staff-playbook', '/management/reports', '/assistant', '/management/campaigns',
    '/management/email-marketing', '/management/kanban', '/notifications',
  ],
  kitchen: ['/kds', '/assistant', '/staff-playbook', '/notifications'],
  foh: ['/pos', '/pos/payment', '/pos/success', '/pos/tables', '/orders', '/customers', '/roadside', '/management/payments', '/assistant', '/notifications', '/staff-playbook'],
};

const VALID_PAGE_PATHS = new Set(Object.values(ROUTE_ACCESS).flat());

// Pages that are integral steps of another page's flow. Granting the parent
// page implicitly grants these so custom page-access lists can never strand
// a user mid-flow (e.g. POS checkout redirecting away from /pos/payment).
const IMPLIED_PAGE_ACCESS = {
  '/pos': ['/pos/payment', '/pos/success'],
};

const API_PAGE_ACCESS = [
  { api: '/api/menu', path: /^\/(?:categories|modifiers|export)(?:\/|$)|^\/[^/]*$/, pages: ['/management/menu'] },
  { api: '/api/orders', path: /^\/offers(?:\/|$)/, pages: ['/management/loyalty', '/management/campaigns'] },
  { api: '/api/orders', path: /^\/reservations(?:\/|$)/, pages: ['/roadside'] },
  { api: '/api/orders', path: /^\/[^/]+\/refunds$/, method: 'POST', pages: ['/orders', '/management/payments'] },
  { api: '/api/orders', path: /^\/held(?:\/|$)/, pages: ['/pos'] },
  { api: '/api/orders', path: /^\/[^/]+\/(?:share-link|reservation)(?:\/|$)/, pages: ['/orders', '/roadside'] },
  { api: '/api/tables', path: /^\/[^/]+\/(?:tab|payments)(?:\/|$)/, pages: ['/pos', '/pos/tables'] },
  { api: '/api/staff', path: /^\/kanban(?:\/|$)/, pages: ['/management/kanban'] },
  { api: '/api/staff', path: /^\/(?:roles|attendance|tracking)(?:\/|$)|^\/[^/]+(?:\/credentials)?$|^\/$/, pages: ['/management/people'] },
  { api: '/api/business', path: /^\/checklists\/tasks(?:\/|$)/, pages: ['/management/operations', '/management/people'] },
  { api: '/api/business', path: /^\/expenses\/[^/]+$/, pages: ['/management/operations'] },
  { api: '/api/crm-intelligence', path: /^\/(?:snapshot|swot|briefing|ask|actions)(?:\/|$)/, pages: ['/crm'] },
  { api: '/api/email-marketing', path: /^\/.+$/, pages: ['/management/email-marketing', '/management/campaigns'] },
  { api: '/api/settings', path: /^\/(?:wifi-qr|)$/, pages: ['/management/settings'] },
  { api: '/api/loyalty', path: /^\/.+$/, pages: ['/management/loyalty', '/crm'] },
  { api: '/api/payments', path: /^\/.+$/, pages: ['/management/payments', '/pos'] },
  { api: '/api/roadside', path: /^\/.+$/, pages: ['/roadside'] },
];

export function getApiPageAccess(apiPath, routePath, method, body) {
  const normalizedApiPath = String(apiPath ?? '').replace(/\/+$/, '');
  const normalizedRoutePath = `/${String(routePath ?? '').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '') || '/';
  const normalizedMethod = String(method ?? '').toUpperCase();
  const pages = API_PAGE_ACCESS.find((entry) => entry.api === normalizedApiPath
    && entry.path.test(normalizedRoutePath)
    && (!entry.method || entry.method === normalizedMethod))?.pages || [];
  if (normalizedApiPath === '/api/settings' && normalizedRoutePath === '/' && String(method).toUpperCase() === 'PUT') {
    const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    if (bodyKeys.length > 0 && bodyKeys.every((key) => ['custom_staff_roles', 'shift_types'].includes(key))) {
      return [...pages, '/management/people'];
    }
  }
  return pages;
}

export function hasDelegatedApiPageAccess(user, apiPath, routePath, method, body) {
  if (!user || typeof user !== 'object') return false;
  const pageAccess = expandImpliedPageAccess(normalizePageAccess(user.pageAccess ?? user.page_access ?? []));
  return getApiPageAccess(apiPath, routePath, method, body)
    .some((page) => pageAccess.includes(page));
}

export function expandImpliedPageAccess(paths) {
  const next = Array.isArray(paths) ? [...paths] : [];
  for (const [parent, implied] of Object.entries(IMPLIED_PAGE_ACCESS)) {
    if (!next.includes(parent)) continue;
    for (const path of implied) {
      if (VALID_PAGE_PATHS.has(path) && !next.includes(path)) next.push(path);
    }
  }
  return next;
}

export function normalizeRoleName(role) {
  const value = String(role ?? '').trim();
  if (!value) return 'foh';

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'foh';

  const aliases = {
    admin: 'admin',
    'super admin': 'admin',
    superadmin: 'admin',
    'super administrator': 'admin',
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
    return expandImpliedPageAccess(explicit);
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
