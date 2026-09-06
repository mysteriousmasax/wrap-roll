const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function getToken() {
  return localStorage.getItem('wraproll_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('wraproll_token', token);
  else localStorage.removeItem('wraproll_token');
}

export async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Network error — is the server running?', 0);
  }

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || res.statusText, res.status);
  return data;
}

export const api = {
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  updateProfile: (data) => request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),

  getMenu: (all = false) => request(`/menu${all ? '?all=1' : ''}`),
  exportMenuBook: async (format) => {
    const token = getToken();
    const response = await fetch(`${API_BASE}/menu/export?format=${encodeURIComponent(format)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || response.statusText, response.status);
    }
    return { blob: await response.blob(), filename: `wrap-roll-menu-book.${format}` };
  },
  getPublicMenu: () => request('/menu/public'),
  getModifiers: () => request('/menu/modifiers'),
  createModifier: (data) => request('/menu/modifiers', { method: 'POST', body: JSON.stringify(data) }),
  updateModifier: (id, data) => request(`/menu/modifiers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteModifier: (id) => request(`/menu/modifiers/${id}`, { method: 'DELETE' }),
  createMenuItem: (data) => request('/menu', { method: 'POST', body: JSON.stringify(data) }),
  updateMenuItem: (id, data) => request(`/menu/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMenuItem: (id) => request(`/menu/${id}`, { method: 'DELETE' }),

  getOrders: (status) => request(`/orders${status ? `?status=${status}` : ''}`),
  getOrder: (id) => request(`/orders/${id}`),
  createOrder: (data) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  createPublicOrder: (data) => request('/orders/public', { method: 'POST', body: JSON.stringify(data) }),
  updateOrderStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateOrderPaymentStatus: (id, paymentStatus) => request(`/orders/${id}/payment-status`, { method: 'PATCH', body: JSON.stringify({ paymentStatus }) }),

  getTables: () => request('/tables'),
  getPublicTable: (tagId) => request(`/tables/public/${encodeURIComponent(tagId)}`),
  createTable: (data) => request('/tables', { method: 'POST', body: JSON.stringify(data) }),
  updateTable: (id, data) => request(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getCustomers: () => request('/customers'),
  getCrmIntelligence: () => request('/crm-intelligence/snapshot'),
  generateCrmSwot: () => request('/crm-intelligence/swot', { method: 'POST' }),
  generateDailyBriefing: () => request('/crm-intelligence/briefing', { method: 'POST' }),
  askCrmAssistant: (question) => request('/crm-intelligence/ask', { method: 'POST', body: JSON.stringify({ question }) }),
  requestCrmAction: (type, payload) => request('/crm-intelligence/actions', { method: 'POST', body: JSON.stringify({ type, payload }) }),
  updateCustomerLoyalty: (id, data) => request(`/customers/${id}/loyalty`, { method: 'PATCH', body: JSON.stringify(data) }),
  getLoyaltyItems: () => request('/loyalty'),
  getCampaignDashboard: () => request('/loyalty/dashboard'),
  dispatchCustomerCampaign: () => request('/loyalty/campaign/dispatch', { method: 'POST' }),
  sendWhatsApp: (data) => request('/customers/whatsapp', { method: 'POST', body: JSON.stringify(data) }),

  getHolidayFeed: () => request('/calendar/feed'),
  syncHolidayFeed: () => request('/calendar/sync', { method: 'POST' }),
  dispatchHolidayNotifications: () => request('/calendar/dispatch', { method: 'POST' }),

  getStaff: () => request('/staff'),
  getStaffRoles: () => request('/staff/roles'),
  deleteStaff: (id) => request(`/staff/${id}`, { method: 'DELETE' }),
  getStaffTracking: () => request('/staff/tracking'),
  createStaff: (data) => request('/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id, data) => request(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateStaffCredentials: (id, data) => request(`/staff/${id}/credentials`, { method: 'PATCH', body: JSON.stringify(data) }),
  clockStaff: (id, action) => request(`/staff/${id}/clock`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  createStaffTask: (data) => request('/staff/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateStaffTask: (id, status) => request(`/staff/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getInventory: () => request('/inventory'),
  getInventoryAudit: (id) => request(`/inventory/${id}/audit`),
  adjustInventory: (id, data) => request(`/inventory/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  createInventory: (data) => request('/inventory', { method: 'POST', body: JSON.stringify(data) }),
  updateInventory: (id, data) => request(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getSettings: () => request('/settings'),
  getPublicSettings: () => request('/settings/public'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),

  getSales: () => request('/analytics/sales'),
  getAnalyticsSummary: () => request('/analytics/summary'),
  getCategorySales: () => request('/analytics/categories'),
  getPublicChat: (conversationId, customerEmail = '', customerName = '', customerPhone = '') => request(`/chat/public/${encodeURIComponent(conversationId)}?customerEmail=${encodeURIComponent(customerEmail)}&customerName=${encodeURIComponent(customerName)}&customerPhone=${encodeURIComponent(customerPhone)}`),
  sendPublicChatMessage: (conversationId, message, customerName, customerPhone, customerEmail, messageType = 'text', attachmentUrl = null, metadata = {}) => request(`/chat/public/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify({ message, customerName, customerPhone, customerEmail, messageType, attachmentUrl, metadata }) }),
  getChatConversations: () => request('/chat'),
  sendChatReply: (conversationId, message) => request(`/chat/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  getChatFaqs: () => request('/chat/faq'),
  getChatTraining: () => request('/chat/training'),
  retrainChatAssistant: () => request('/chat/training/retrain', { method: 'POST' }),
  createChatFaq: (data) => request('/chat/faq', { method: 'POST', body: JSON.stringify(data) }),
  updateChatFaq: (id, data) => request(`/chat/faq/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChatFaq: (id) => request(`/chat/faq/${id}`, { method: 'DELETE' }),
  getAnalyticsReports: () => request('/analytics/reports'),
  getReports: () => request('/analytics/reports'),
  getFinancialReportPreview: (type) => request(`/analytics/reports/data?type=${encodeURIComponent(type)}`),
  exportFinancialReport: async (type, format) => {
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(`${API_BASE}/analytics/reports/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`, { headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || response.statusText, response.status);
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `wrap-roll-${type}-report.${format}`;
    return { blob: await response.blob(), filename };
  },
  generateAiOperationsReview: () => request('/analytics/ai-review', { method: 'POST' }),
  askAiAssistant: (question) => request('/analytics/ai-assistant', { method: 'POST', body: JSON.stringify({ question }) }),
  getAiActivity: () => request('/analytics/ai-activity'),
  getBusinessOverview: () => request('/business/overview'),
  getBusinessExpenses: () => request('/business/expenses'),
  createBusinessExpense: (data) => request('/business/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateBusinessExpense: (id, data) => request(`/business/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBusinessExpense: (id) => request(`/business/expenses/${id}`, { method: 'DELETE' }),
  updateBusinessExpenseStatus: (id, status) => request(`/business/expenses/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
