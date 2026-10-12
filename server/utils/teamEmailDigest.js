import db from '../db/database.js';
import { isEmailDeliveryConfigured, sendEmail } from './emailDelivery.js';

export const DIGEST_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const CONFIG_KEY = 'team_email_digest';
const DEFAULT_CONFIG = {
  enabled: false,
  frequencies: ['daily', 'weekly', 'monthly'],
  sendHour: 8,
  recipientStaffIds: null,
  topics: { financial: true, lowStock: true, kanban: true },
};

export function normalizeTeamDigestConfig(value = {}) {
  const frequencies = Array.isArray(value.frequencies)
    ? [...new Set(value.frequencies.filter((frequency) => DIGEST_FREQUENCIES.includes(frequency)))]
    : DEFAULT_CONFIG.frequencies;
  const requestedHour = Number(value.sendHour);
  return {
    enabled: value.enabled === true,
    frequencies,
    sendHour: Number.isInteger(requestedHour) ? Math.max(0, Math.min(23, requestedHour)) : DEFAULT_CONFIG.sendHour,
    recipientStaffIds: Array.isArray(value.recipientStaffIds)
      ? [...new Set(value.recipientStaffIds.map(Number).filter(Number.isSafeInteger))]
      : null,
    topics: {
      financial: value.topics?.financial !== false,
      lowStock: value.topics?.lowStock !== false,
      kanban: value.topics?.kanban !== false,
    },
  };
}

export function getTeamDigestConfig() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get(CONFIG_KEY)?.value;
  try { return normalizeTeamDigestConfig(stored ? JSON.parse(stored) : DEFAULT_CONFIG); }
  catch { return normalizeTeamDigestConfig(DEFAULT_CONFIG); }
}

export function saveTeamDigestConfig(value) {
  const config = normalizeTeamDigestConfig(value);
  if (!Object.values(config.topics).some(Boolean)) throw new Error('Select at least one report topic.');
  if (config.enabled && !getTeamDigestRecipients(config).length) throw new Error('Select at least one staff recipient with an email address.');
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export function getTeamDigestStaff() {
  const staff = db.prepare(`SELECT staff.id, staff.name, COALESCE(staff.role, users.role) AS role, users.email
    FROM staff LEFT JOIN users ON users.id = staff.user_id
    WHERE staff.status != 'removed'`).all();
  const standaloneAdmins = db.prepare(`SELECT users.id * -1 AS id, users.name, users.role, users.email
    FROM users
    WHERE replace(replace(replace(lower(users.role), ' ', ''), '_', ''), '-', '') IN ('admin', 'administrator', 'superadmin')
      AND trim(COALESCE(users.email, '')) != ''
      AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.user_id = users.id AND staff.status != 'removed')`).all();
  return [...staff, ...standaloneAdmins]
    .map((member) => ({ ...member, email: String(member.email || '').trim().toLowerCase() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getTeamDigestRecipients(config = getTeamDigestConfig()) {
  return getTeamDigestStaff().filter((staff) => staff.email
    && (config.recipientStaffIds === null || config.recipientStaffIds.includes(Number(staff.id))));
}

function dateKeyInTimezone(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getDigestPeriod(frequency, dateKey) {
  if (!DIGEST_FREQUENCIES.includes(frequency)) throw new Error('Choose daily, weekly, or monthly reporting.');
  if (frequency === 'daily') {
    const previousDay = shiftDate(dateKey, -1);
    return { start: previousDay, end: previousDay };
  }
  if (frequency === 'weekly') {
    const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
    const monday = shiftDate(dateKey, -((weekday + 6) % 7));
    return { start: shiftDate(monday, -7), end: shiftDate(monday, -1) };
  }
  const monthStart = `${dateKey.slice(0, 7)}-01`;
  const previousMonthEnd = shiftDate(monthStart, -1);
  return { start: `${previousMonthEnd.slice(0, 7)}-01`, end: previousMonthEnd };
}

function getTimezone() {
  return db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get()?.value || 'Africa/Dar_es_Salaam';
}

function nextDate(dateKey) {
  return shiftDate(dateKey, 1);
}

function localMidnightUtc(dateKey, timezone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjustment = target - represented;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate).toISOString();
}

export function getDigestPeriodUtcBounds(period, timezone = getTimezone()) {
  return {
    start: localMidnightUtc(period.start, timezone),
    end: localMidnightUtc(nextDate(period.end), timezone),
  };
}

function sumRows(rows, key) {
  return Number(rows.reduce((total, row) => total + Number(row[key] || 0), 0).toFixed(2));
}

export function buildTeamDigestReport(frequency, now = new Date()) {
  const timezone = getTimezone();
  const period = getDigestPeriod(frequency, dateKeyInTimezone(now, timezone));
  const config = getTeamDigestConfig();
  const report = { frequency, period, topics: config.topics };

  if (config.topics.financial) {
    const { start, end } = getDigestPeriodUtcBounds(period, timezone);
    const orders = db.prepare(`SELECT total FROM orders WHERE created_at >= ? AND created_at < ?
      AND status = 'completed' AND payment_status IN ('paid', 'completed')`).all(start, end);
    const expenses = db.prepare(`SELECT amount FROM business_expenses WHERE expense_date >= ? AND expense_date < ?
      AND status NOT IN ('rejected', 'deleted')`).all(period.start, nextDate(period.end));
    const payroll = db.prepare('SELECT pay_period, net_pay FROM payroll_records').all()
      .filter((row) => {
        const payPeriod = String(row.pay_period || '');
        if (/^\d{4}-\d{2}$/.test(payPeriod)) return frequency === 'monthly' && payPeriod === period.start.slice(0, 7);
        return payPeriod >= period.start && payPeriod <= period.end;
      });
    const revenue = sumRows(orders, 'total');
    const expenseTotal = sumRows(expenses, 'amount');
    const payrollTotal = sumRows(payroll, 'net_pay');
    report.financial = {
      currency: db.prepare("SELECT value FROM settings WHERE key = 'currency'").get()?.value || 'TZS',
      revenue,
      orders: orders.length,
      averageOrder: orders.length ? Number((revenue / orders.length).toFixed(2)) : 0,
      expenses: expenseTotal,
      payroll: payrollTotal,
      operatingResult: Number((revenue - expenseTotal - payrollTotal).toFixed(2)),
    };
  }

  if (config.topics.lowStock) {
    report.lowStock = db.prepare(`SELECT name, quantity, unit, threshold, supplier FROM inventory
      WHERE deleted_at IS NULL AND threshold IS NOT NULL AND quantity <= threshold ORDER BY quantity ASC, name`).all();
  }

  if (config.topics.kanban) {
    report.kanban = db.prepare(`SELECT staff_tasks.title, staff_tasks.description, staff_tasks.category, staff_tasks.priority,
      staff_tasks.status, staff_tasks.due_date, staff.name AS staff_name
      FROM staff_tasks INNER JOIN staff ON staff.id = staff_tasks.staff_id
      WHERE staff_tasks.task_type = 'kanban' AND staff_tasks.status IN ('open', 'in_progress', 'blocked')
        AND staff.status != 'removed'
      ORDER BY CASE staff_tasks.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        staff_tasks.due_date IS NULL, staff_tasks.due_date ASC`).all();
  }
  return report;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function formatMoney(amount, currency) {
  return `${Number(amount || 0).toLocaleString('en-TZ')} ${escapeHtml(currency)}`;
}

export function renderTeamDigest(report) {
  const title = `${report.frequency[0].toUpperCase()}${report.frequency.slice(1)} staff operations report`;
  const sections = [];
  const text = [title, `Period: ${report.period.start} to ${report.period.end}`];
  if (report.financial) {
    const finance = report.financial;
    sections.push(`<h2>Financial analytics</h2><table style="border-collapse:collapse;width:100%"><tbody>${[
      ['Revenue', formatMoney(finance.revenue, finance.currency)], ['Completed orders', finance.orders],
      ['Average order value', formatMoney(finance.averageOrder, finance.currency)], ['Expenses', formatMoney(finance.expenses, finance.currency)],
      ['Payroll booked', formatMoney(finance.payroll, finance.currency)], ['Operating result', formatMoney(finance.operatingResult, finance.currency)],
    ].map(([label, value]) => `<tr><th style="padding:8px;text-align:left;border-bottom:1px solid #ddd">${label}</th><td style="padding:8px;border-bottom:1px solid #ddd">${value}</td></tr>`).join('')}</tbody></table>`);
    text.push('', 'Financial analytics', `Revenue: ${finance.revenue} ${finance.currency}`, `Completed orders: ${finance.orders}`, `Average order value: ${finance.averageOrder} ${finance.currency}`, `Expenses: ${finance.expenses} ${finance.currency}`, `Payroll booked: ${finance.payroll} ${finance.currency}`, `Operating result: ${finance.operatingResult} ${finance.currency}`);
  }
  if (report.lowStock) {
    sections.push(`<h2>Low stock (${report.lowStock.length})</h2>${report.lowStock.length ? `<ul>${report.lowStock.map((item) => `<li>${escapeHtml(item.name)}: ${escapeHtml(item.quantity)} ${escapeHtml(item.unit || '')} (reorder at ${escapeHtml(item.threshold)}${item.supplier ? `; supplier ${escapeHtml(item.supplier)}` : ''})</li>`).join('')}</ul>` : '<p>No items are below their stock thresholds.</p>'}`);
    text.push('', `Low stock (${report.lowStock.length})`, ...(report.lowStock.length ? report.lowStock.map((item) => `${item.name}: ${item.quantity} ${item.unit || ''} (threshold ${item.threshold})`) : ['No items are below their stock thresholds.']));
  }
  if (report.kanban) {
    sections.push(`<h2>Open team Kanban (${report.kanban.length})</h2>${report.kanban.length ? `<ul>${report.kanban.map((task) => `<li><strong>${escapeHtml(task.title)}</strong> - ${escapeHtml(task.staff_name)}; ${escapeHtml(task.status)}; ${escapeHtml(task.priority)}${task.due_date ? `; due ${escapeHtml(task.due_date)}` : ''}${task.description ? `<br>${escapeHtml(task.description)}` : ''}</li>`).join('')}</ul>` : '<p>No open Kanban tasks.</p>'}`);
    text.push('', `Open team Kanban (${report.kanban.length})`, ...(report.kanban.length ? report.kanban.map((task) => `${task.title} - ${task.staff_name}; ${task.status}; ${task.priority}${task.due_date ? `; due ${task.due_date}` : ''}`) : ['No open Kanban tasks.']));
  }
  return { subject: `${title} | ${report.period.start} to ${report.period.end}`, text: text.join('\n'), html: `<div style="font:14px Arial,sans-serif;line-height:1.6;color:#292522"><h1>${escapeHtml(title)}</h1><p>Period: ${report.period.start} to ${report.period.end}</p>${sections.join('')}</div>` };
}

export async function sendTeamDigest(frequency, { force = false, now = new Date() } = {}) {
  if (!isEmailDeliveryConfigured()) throw new Error('Configure Resend or SMTP before sending team reports.');
  const config = getTeamDigestConfig();
  const report = buildTeamDigestReport(frequency, now);
  const recipients = getTeamDigestRecipients(config);
  if (!recipients.length) throw new Error('No active staff members have an email address linked to their account.');
  const message = renderTeamDigest(report);
  const results = { sent: 0, skipped: 0, failed: 0, failures: [] };
  for (const recipient of recipients) {
    const previous = db.prepare(`SELECT status FROM team_email_digest_deliveries
      WHERE frequency = ? AND period_start = ? AND recipient_email = ?`).get(frequency, report.period.start, recipient.email);
    if (previous?.status === 'sent' && !force) { results.skipped += 1; continue; }
    const updatedAt = new Date().toISOString();
    db.prepare(`INSERT INTO team_email_digest_deliveries
      (frequency, period_start, period_end, recipient_email, status, response, updated_at)
      VALUES (?, ?, ?, ?, 'sending', '', ?)
      ON CONFLICT(frequency, period_start, recipient_email) DO UPDATE SET
        period_end = excluded.period_end, status = 'sending', response = '', updated_at = excluded.updated_at`)
      .run(frequency, report.period.start, report.period.end, recipient.email, updatedAt);
    try {
      await sendEmail({ to: recipient.email, ...message });
      const sentAt = new Date().toISOString();
      db.prepare(`UPDATE team_email_digest_deliveries SET status = 'sent', response = '', sent_at = ?, updated_at = ?
        WHERE frequency = ? AND period_start = ? AND recipient_email = ?`)
        .run(sentAt, sentAt, frequency, report.period.start, recipient.email);
      results.sent += 1;
    } catch (error) {
      const response = String(error.message || 'Delivery failed').slice(0, 500);
      db.prepare(`UPDATE team_email_digest_deliveries SET status = 'failed', response = ?, updated_at = ?
        WHERE frequency = ? AND period_start = ? AND recipient_email = ?`)
        .run(response, new Date().toISOString(), frequency, report.period.start, recipient.email);
      results.failed += 1;
      results.failures.push({ email: recipient.email, error: response });
    }
  }
  return { ...results, period: report.period, recipientCount: recipients.length };
}

export async function processScheduledTeamDigest(now = new Date()) {
  const config = getTeamDigestConfig();
  if (!config.enabled || !config.frequencies.length || !isEmailDeliveryConfigured()) return;
  const timezone = getTimezone();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  if (Number(parts.hour) < config.sendHour) return;
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const due = config.frequencies.filter((frequency) => (
    frequency === 'daily' || (frequency === 'weekly' && parts.weekday === 'Mon') || (frequency === 'monthly' && parts.day === '01')
  ));
  for (const frequency of due) {
    try {
      const result = await sendTeamDigest(frequency, { now });
      if (result.failed) console.error(`Team ${frequency} digest had ${result.failed} delivery failures.`);
    } catch (error) {
      console.error(`Team ${frequency} digest failed:`, error.message);
    }
  }
  return dateKey;
}