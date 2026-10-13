import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { deletionViewer, requireAdilaDeletion, recordDeletion } from '../utils/deletionPolicy.js';
import { restaurantDateBounds, restaurantTime } from '../utils/localTime.js';

const router = Router();

const operationalChecklists = [
  {
    id: 'morning-kitchen', time: '07:00-09:30', title: 'Kitchen prep & sanitation', lead: 'Head Chef', tasks: [
      ['temperatures', 'Calibrate warmers and refrigerators; record temperature checks.'],
      ['bread-prep', 'Bake fresh White and Cheese & Herbs bread batches.'],
      ['ingredient-prep', 'Slice vegetables and prepare Chicken Tandoori, Steak, and Tuna fillings.'],
    ],
  },
  {
    id: 'foh-digital', time: '09:00-10:00', title: 'FOH & digital setup', lead: 'Shift Supervisor', tasks: [
      ['pos-float', 'Turn on POS and sync the register float.'],
      ['channels-nfc', 'Enable WhatsApp Business replies and test the NFC reader.'],
      ['counter-stock', 'Restock Jute Pouches and Seed Paper Coasters at the counter.'],
    ],
  },
  {
    id: 'lunch-rush', time: '11:30-14:30', title: 'Peak lunch rush', lead: 'Expeditor / Cashier', tasks: [
      ['wrap-quality', 'Check rapid wrap/roll assembly and tight foil wrapping.'],
      ['bread-upsell', 'Ask each customer for bread choice and offer Make It a Meal.'],
      ['delivery-dispatch', 'Dispatch Bolt drivers and log order completion in POS.'],
    ],
  },
  {
    id: 'midday-handover', time: '15:00-16:00', title: 'Mid-day handover', lead: 'Managers out / in', tasks: [
      ['stock-count', 'Count bread and meat stock.'],
      ['cash-reconcile', 'Reconcile cash float and mobile money transactions.'],
      ['handover-brief', 'Complete the handover sheet and brief the incoming team.'],
    ],
  },
  {
    id: 'evening-close', time: '17:00-22:00', title: 'Evening rush & close', lead: 'Closing Supervisor', tasks: [
      ['hourly-temperature', 'Manage the rush and complete hourly temperature checks.'],
      ['clean-assembly', 'Turn off ovens, deep clean assembly lines, and sanitize surfaces.'],
      ['final-reconcile', 'Reconcile cash/NFC and lock the premises securely.'],
    ],
  },
];

const checklistSettingsKey = 'operational_checklists';

function getOperationalChecklists() {
  const saved = db.prepare('SELECT value FROM settings WHERE key = ?').get(checklistSettingsKey)?.value;
  let source = operationalChecklists;
  try {
    const parsed = saved ? JSON.parse(saved) : null;
    if (Array.isArray(parsed)) source = parsed;
  } catch {
    source = operationalChecklists;
  }
  return source.map((phase) => ({
    ...phase,
    tasks: Array.isArray(phase.tasks)
      ? phase.tasks.map((task) => Array.isArray(task) ? { key: task[0], label: task[1] } : task)
        .filter((task) => typeof task?.key === 'string' && typeof task?.label === 'string')
      : [],
  }));
}

function saveOperationalChecklists(checklists) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(checklistSettingsKey, JSON.stringify(checklists));
}

function businessDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return '';
  return date;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

const DEFAULT_HANDOVER_COUNTS = [
  { item: 'White Bread Rolls', unit: 'loaves', opening: '', added: '', closing: '', status: 'ok' },
  { item: 'Cheese & Herbs Rolls', unit: 'loaves', opening: '', added: '', closing: '', status: 'ok' },
  { item: 'Chicken Tandoori Prep', unit: 'kg', opening: '', added: '', closing: '', status: 'ok' },
  { item: 'House Steak Prep', unit: 'kg', opening: '', added: '', closing: '', status: 'ok' },
  { item: 'Jute Pouches & Coasters', unit: 'units', opening: '', added: '', closing: '', status: 'ok' },
  { item: 'NFC Loyalty Tags / Cards', unit: 'cards', opening: '', added: '', closing: '', status: 'ok' },
];

function inventoryCountStatus(staffCounts = []) {
  const closingCounts = staffCounts.filter((count) => count.closing !== '' && count.closing != null);
  if (!closingCounts.length) return 'not-counted';
  if (closingCounts.length < 2) return 'pending-confirmation';
  return closingCounts.every((count) => Number(count.closing) === Number(closingCounts[0].closing))
    ? 'confirmed'
    : 'mismatch';
}

function decorateInventoryCounts(counts, userId) {
  return counts.map((row) => {
    const staffCounts = Array.isArray(row.staffCounts) ? row.staffCounts : [];
    return {
      ...row,
      staffCounts,
      currentStaffCount: staffCounts.find((count) => String(count.userId) === String(userId)) || null,
      confirmationStatus: inventoryCountStatus(staffCounts),
    };
  });
}

function sameInventoryCountItem(left, right) {
  if (left.inventoryId && right.inventoryId) return Number(left.inventoryId) === Number(right.inventoryId);
  return String(left.item || '').trim().toLowerCase() === String(right.item || '').trim().toLowerCase()
    && String(left.unit || 'units').trim().toLowerCase() === String(right.unit || 'units').trim().toLowerCase();
}

function getShiftTransactionTotals(date, shift) {
  const { start, end } = restaurantDateBounds(date);
  const shiftName = shift === 'evening' ? '%evening%' : '%morning%';
  const staffUsers = db.prepare(`SELECT user_id FROM staff
    WHERE user_id IS NOT NULL AND status != 'removed' AND lower(shift) LIKE ?`).all(shiftName).map((row) => row.user_id);
  const totals = { cashSales: 0, mobileMoney: 0, nfc: 0 };
  if (!staffUsers.length) return totals;
  const placeholders = staffUsers.map(() => '?').join(',');
  const transactions = db.prepare(`SELECT lower(payment_method) AS method, COALESCE(SUM(total), 0) AS amount
    FROM orders
    WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'
      AND payment_status IN ('paid', 'completed') AND payment_method IS NOT NULL
      AND lower(order_source) = 'pos' AND staff_id IN (${placeholders})
    GROUP BY lower(payment_method)`).all(start, end, ...staffUsers);
  for (const transaction of transactions) {
    const method = transaction.method || '';
    const key = method.includes('cash') ? 'cashSales' : method.includes('nfc') ? 'nfc' : 'mobileMoney';
    totals[key] += Number(transaction.amount || 0);
  }
  return totals;
}

function mergeTransactionExpectations(reconciliation, totals) {
  const merged = { ...reconciliation };
  for (const [key, expected] of Object.entries(totals)) {
    const row = { ...(merged[key] || { actual: '', notes: '' }) };
    if (row.expectedSource !== 'manual') row.expected = expected;
    row.expectedSource = row.expectedSource === 'manual' ? 'manual' : 'transactions';
    merged[key] = row;
  }
  return merged;
}

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { start, end, period: start.slice(0, 7) };
}

router.get('/overview', authMiddleware, (_req, res) => {
  const { start, end, period } = monthBounds();
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND payment_status IN ('paid', 'completed')").get(start, end);
  const expenses = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM business_expenses WHERE expense_date >= ? AND expense_date < ? AND status NOT IN ('rejected', 'deleted')").get(start.slice(0, 10), end.slice(0, 10));
  const payroll = db.prepare('SELECT COALESCE(SUM(net_pay), 0) AS total FROM payroll_records WHERE pay_period = ?').get(period);
  const tax = db.prepare("SELECT COALESCE(SUM(tax), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND payment_status IN ('paid', 'completed')").get(start, end);
  const lowStock = db.prepare('SELECT id, name, quantity, unit, threshold, supplier FROM inventory WHERE quantity <= threshold ORDER BY quantity ASC LIMIT 8').all();
  const cash = db.prepare("SELECT payment_method AS method, COALESCE(SUM(total), 0) AS amount, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND payment_status IN ('paid', 'completed') AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY amount DESC").all(start, end);
  const pendingExpenses = db.prepare("SELECT COUNT(*) AS count FROM business_expenses WHERE status = 'pending'").get();

  res.json({
    period,
    revenue: Number(sales.revenue || 0),
    orders: Number(sales.orders || 0),
    expenses: Number(expenses.total || 0),
    expenseCount: Number(expenses.count || 0),
    payroll: Number(payroll.total || 0),
    tax: Number(tax.total || 0),
    operatingProfit: Number(sales.revenue || 0) - Number(expenses.total || 0) - Number(payroll.total || 0),
    pendingExpenses: Number(pendingExpenses.count || 0),
    lowStock,
    cash,
  });
});

router.get('/checklists', authMiddleware, (req, res) => {
  const date = businessDate(req.query.date) || restaurantTime().date;
  const userId = Number(req.user.id);
  const checklists = getOperationalChecklists();
  const completedRows = db.prepare('SELECT * FROM operational_checklist_user_entries WHERE business_date = ? AND user_id = ?').all(date, userId);
  const completed = new Map(completedRows.map((row) => [`${row.phase}:${row.task_key}`, row]));
  const legacyRows = db.prepare(`SELECT * FROM operational_checklist_entries
    WHERE business_date = ? AND completed = 1 AND LOWER(TRIM(completed_by)) = LOWER(TRIM(?))`).all(date, req.user.name || req.user.username || '');
  legacyRows.forEach((row) => {
    const key = `${row.phase}:${row.task_key}`;
    if (!completed.has(key)) completed.set(key, row);
  });
  const activeTaskKeys = checklists.flatMap((phase) => phase.tasks.map((task) => task.key));
  const taskFilter = activeTaskKeys.length
    ? `AND entries.task_key IN (${activeTaskKeys.map(() => '?').join(', ')})`
    : 'AND 0';
  const teamProgress = ['admin', 'manager', 'executive'].includes(req.user.role)
    ? db.prepare(`SELECT users.id AS userId, staff.id AS staffId,
        COALESCE(users.role, staff.role) AS role, staff.name AS name,
        COALESCE(SUM(entries.completed), 0) AS completedTasks,
        COUNT(entries.id) AS touchedTasks,
        MAX(entries.updated_at) AS lastUpdated
      FROM staff
      LEFT JOIN users ON users.id = staff.user_id
      LEFT JOIN operational_checklist_user_entries entries
        ON entries.user_id = users.id AND entries.business_date = ? ${taskFilter}
      WHERE staff.status != 'removed'
      GROUP BY staff.id
      ORDER BY staff.name`).all(date, ...activeTaskKeys)
    : [];
  res.json({
    date,
    totalTasks: checklists.reduce((count, phase) => count + phase.tasks.length, 0),
    teamProgress,
    phases: checklists.map((phase) => ({
      id: phase.id,
      time: phase.time,
      title: phase.title,
      lead: phase.lead,
      tasks: phase.tasks.map(({ key, label }) => {
        const row = completed.get(`${phase.id}:${key}`);
        return { key, label, completed: Boolean(row?.completed), completedBy: row?.completed_by || '', completedAt: row?.completed_at || null };
      }),
    })),
  });
});

router.post('/checklists/tasks', authMiddleware, requireRole('admin', 'manager', 'executive'), (req, res) => {
  const phaseId = String(req.body?.phaseId || '');
  const label = String(req.body?.label || '').trim();
  const checklists = getOperationalChecklists();
  const phase = checklists.find((item) => item.id === phaseId);
  if (!phase) return res.status(404).json({ error: 'Checklist phase not found.' });
  if (!label || label.length > 240) return res.status(400).json({ error: 'Enter a checklist item under 240 characters.' });

  const task = { key: `custom-${randomUUID()}`, label };
  phase.tasks.push(task);
  saveOperationalChecklists(checklists);
  broadcast('business:updated', { type: 'checklist_definition_updated', phase: phase.id });
  res.status(201).json({ phaseId: phase.id, task });
});

router.put('/checklists/tasks/:taskKey', authMiddleware, requireRole('admin', 'manager', 'executive'), (req, res) => {
  const label = String(req.body?.label || '').trim();
  if (!label || label.length > 240) return res.status(400).json({ error: 'Enter a checklist item under 240 characters.' });
  const checklists = getOperationalChecklists();
  const phase = checklists.find((item) => item.tasks.some((task) => task.key === req.params.taskKey));
  if (!phase) return res.status(404).json({ error: 'Checklist item not found.' });
  const task = phase.tasks.find((item) => item.key === req.params.taskKey);
  task.label = label;
  saveOperationalChecklists(checklists);
  broadcast('business:updated', { type: 'checklist_definition_updated', phase: phase.id });
  res.json({ phaseId: phase.id, task });
});

router.delete('/checklists/tasks/:taskKey', authMiddleware, requireRole('admin', 'manager', 'executive'), (req, res) => {
  const checklists = getOperationalChecklists();
  const phase = checklists.find((item) => item.tasks.some((task) => task.key === req.params.taskKey));
  if (!phase) return res.status(404).json({ error: 'Checklist item not found.' });
  phase.tasks = phase.tasks.filter((task) => task.key !== req.params.taskKey);
  saveOperationalChecklists(checklists);
  broadcast('business:updated', { type: 'checklist_definition_updated', phase: phase.id });
  res.json({ ok: true });
});

router.put('/checklists/:date/:phase/:taskKey', authMiddleware, (req, res) => {
  const date = businessDate(req.params.date);
  const phase = getOperationalChecklists().find((item) => item.id === req.params.phase);
  if (!date || !phase || !phase.tasks.some((task) => task.key === req.params.taskKey)) return res.status(404).json({ error: 'Checklist task not found.' });
  if (typeof req.body?.completed !== 'boolean') return res.status(400).json({ error: 'A completion state is required.' });

  const completed = req.body.completed;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO operational_checklist_user_entries (business_date, user_id, phase, task_key, completed, completed_by, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_date, user_id, phase, task_key) DO UPDATE SET
      completed = excluded.completed, completed_by = excluded.completed_by, completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
    .run(date, Number(req.user.id), phase.id, req.params.taskKey, completed ? 1 : 0, completed ? (req.user?.name || req.user?.username || 'Staff') : '', completed ? now : null, now);
  broadcast('business:updated', { type: 'checklist_updated', date, phase: phase.id });
  res.json({ date, phase: phase.id, taskKey: req.params.taskKey, completed, completedBy: completed ? (req.user?.name || req.user?.username || 'Staff') : '', completedAt: completed ? now : null });
});

router.get('/shift-handover', authMiddleware, (req, res) => {
  const date = businessDate(req.query.date) || restaurantTime().date;
  const shift = ['morning', 'evening'].includes(req.query.shift) ? req.query.shift : 'morning';
  const row = db.prepare('SELECT * FROM shift_handover_records WHERE shift_date = ? AND shift = ?').get(date, shift);
  const handover = row ? {
    ...row,
    reconciliation: parseJson(row.reconciliation_json, {}),
    inventoryCounts: parseJson(row.inventory_counts_json, []),
  } : {
    shift_date: date,
    shift,
    manager_out: '',
    manager_in: '',
    reconciliation: {
      cashFloat: { expected: 100000, actual: '' },
      cashSales: { expected: '', actual: '' },
      mobileMoney: { expected: '', actual: '' },
      nfc: { expected: '', actual: '' },
    },
    inventoryCounts: DEFAULT_HANDOVER_COUNTS.map((item) => ({ ...item })),
    notes: '',
  };
  handover.reconciliation = mergeTransactionExpectations(handover.reconciliation, getShiftTransactionTotals(date, shift));
  handover.inventoryCounts = decorateInventoryCounts(handover.inventoryCounts, req.user.id);
  res.json(handover);
});

router.put('/shift-handover', authMiddleware, (req, res) => {
  const date = businessDate(req.body?.date);
  const shift = String(req.body?.shift || '').toLowerCase();
  if (!date || !['morning', 'evening'].includes(shift)) return res.status(400).json({ error: 'A valid date and shift are required.' });
  if (!req.body?.reconciliation || typeof req.body.reconciliation !== 'object' || !Array.isArray(req.body.inventoryCounts)) {
    return res.status(400).json({ error: 'Payment reconciliation and inventory counts are required.' });
  }

  const now = new Date().toISOString();
  const managerOut = String(req.body?.managerOut || '').trim();
  const managerIn = String(req.body?.managerIn || '').trim();
  const reconciliation = JSON.stringify(req.body.reconciliation);
  const normalizedCounts = req.body.inventoryCounts.map((row) => {
    const normalizeQuantity = (value) => value === '' || value == null ? '' : Number(value);
    return {
      item: String(row?.item || '').trim(),
      unit: String(row?.unit || 'units').trim(),
      inventoryId: row?.inventoryId ? Number(row.inventoryId) : null,
      opening: normalizeQuantity(row?.opening),
      added: normalizeQuantity(row?.added),
      closing: normalizeQuantity(row?.closing),
      status: ['ok', 'restock', 'prep'].includes(row?.status) ? row.status : 'ok',
    };
  });
  if (normalizedCounts.some((row) => [row.opening, row.added, row.closing].some((value) => value !== '' && (!Number.isFinite(value) || value < 0)))) {
    return res.status(400).json({ error: 'Stock counts need valid non-negative quantities.' });
  }
  const notes = String(req.body?.notes || '').trim();
  const updatedInventoryIds = [];
  const countedInventoryIds = [];
  try {
    const saveHandover = db.transaction(() => {
      const savedRecord = db.prepare('SELECT inventory_counts_json FROM shift_handover_records WHERE shift_date = ? AND shift = ?').get(date, shift);
      const existingCounts = savedRecord ? parseJson(savedRecord.inventory_counts_json, DEFAULT_HANDOVER_COUNTS) : DEFAULT_HANDOVER_COUNTS;
      const existingFor = (row) => existingCounts.find((existing) => sameInventoryCountItem(row, existing));
      const resolveInventoryItem = (row) => row.inventoryId
        ? db.prepare("SELECT * FROM inventory WHERE id = ? AND COALESCE(deleted_at, '') = ''").get(row.inventoryId)
        : db.prepare(`SELECT * FROM inventory WHERE lower(trim(name)) = lower(?) AND lower(trim(unit)) = lower(?)
          AND COALESCE(deleted_at, '') = '' ORDER BY id LIMIT 1`).get(row.item, row.unit);
      if (!['admin', 'manager', 'executive'].includes(req.user?.role)) {
        const keepsExistingItems = existingCounts.every((existing) => normalizedCounts.some((row) => sameInventoryCountItem(row, existing)));
        const additionsAreInInventory = normalizedCounts.every((row) => existingFor(row) || resolveInventoryItem(row));
        if (!keepsExistingItems || !additionsAreInInventory) {
          throw Object.assign(new Error('You can add items from inventory, but cannot remove existing shift count items.'), { status: 403 });
        }
      }
      const seenInventoryIds = new Set();
      for (const [index, row] of normalizedCounts.entries()) {
        const existing = existingFor(row);
        const item = resolveInventoryItem(row);
        if (!item && row.closing !== '') throw new Error(`Add “${row.item}” to inventory before reconciling its closing count.`);
        if (!item && !existing) throw Object.assign(new Error(`Select “${row.item}” from inventory before adding it to this shift.`), { status: 403 });
        if (!item) {
          normalizedCounts[index] = { ...row, ...existing, staffCounts: existing.staffCounts || [] };
          continue;
        }
        if (seenInventoryIds.has(item.id)) throw new Error(`${row.item} appears more than once in this handover.`);
        seenInventoryIds.add(item.id);
        const savedItem = existing || {};
        const staffCounts = Array.isArray(savedItem.staffCounts) ? [...savedItem.staffCounts] : [];
        const currentStaffCount = {
          userId: Number(req.user.id),
          staffName: req.user?.name || req.user?.username || 'Staff',
          opening: row.opening,
          added: row.added,
          closing: row.closing,
          status: row.status,
          countedAt: now,
        };
        const hasCount = [row.opening, row.added, row.closing].some((value) => value !== '');
        const staffCountIndex = staffCounts.findIndex((count) => String(count.userId) === String(req.user.id));
        const previousStaffCount = staffCountIndex >= 0 ? staffCounts[staffCountIndex] : null;
        if (hasCount) {
          if (staffCountIndex >= 0) staffCounts[staffCountIndex] = currentStaffCount;
          else staffCounts.push(currentStaffCount);
        }
        const confirmationStatus = inventoryCountStatus(staffCounts);
        const updatedRow = {
          ...savedItem,
          item: item.name,
          unit: item.unit || row.unit,
          inventoryId: item.id,
          staffCounts,
        };
        if (confirmationStatus === 'confirmed') {
          const confirmedCounts = staffCounts.filter((count) => count.closing !== '' && count.closing != null);
          const confirmedClosing = Number(confirmedCounts[0].closing);
          updatedRow.opening = row.opening;
          updatedRow.added = row.added;
          updatedRow.closing = confirmedClosing;
          updatedRow.status = row.status;
          if (Math.abs(Number(item.quantity) - confirmedClosing) > 1e-9) {
            db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?').run(confirmedClosing, item.id);
            updatedInventoryIds.push(item.id);
          }
          if (Number(item.quantity) > Number(item.threshold || 0) && confirmedClosing <= Number(item.threshold || 0)) {
            db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
              VALUES ('warning', ?, ?, 0, ?, 'manager')`).run(
              `Low stock: ${item.name}`,
              `${item.name} was confirmed at ${confirmedClosing} ${item.unit || ''} during ${shift} shift handover. Reorder threshold: ${item.threshold}.`,
              now
            );
          }
        }
        if (hasCount) {
          const summarizeCount = (count) => count
            ? `opening ${count.opening === '' ? '—' : count.opening}, added ${count.added === '' ? '—' : count.added}, closing ${count.closing === '' ? '—' : count.closing} ${item.unit || row.unit}`
            : 'not recorded';
          const changes = {
            shiftCount: {
              from: summarizeCount(previousStaffCount),
              to: `${date} ${shift}: ${summarizeCount(currentStaffCount)} (${confirmationStatus})`,
            },
          };
          if (confirmationStatus === 'confirmed' && Math.abs(Number(item.quantity) - Number(updatedRow.closing)) > 1e-9) {
            changes.quantity = { from: item.quantity, to: updatedRow.closing };
            changes.reason = { from: null, to: `${shift} shift count confirmed by multiple staff` };
          }
          db.prepare(`INSERT INTO inventory_audit
            (inventory_id, action, changed_by_id, changed_by_name, changed_by_role, changes, created_at)
            VALUES (?, 'updated', ?, ?, ?, ?, ?)`).run(
            item.id,
            req.user?.id ?? null,
            currentStaffCount.staffName,
            req.user?.role || 'staff',
            JSON.stringify(changes),
            now
          );
          countedInventoryIds.push(item.id);
        }
        normalizedCounts[index] = updatedRow;
      }
      db.prepare(`INSERT INTO shift_handover_records
        (shift_date, shift, manager_out, manager_in, reconciliation_json, inventory_counts_json, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shift_date, shift) DO UPDATE SET
          manager_out = excluded.manager_out, manager_in = excluded.manager_in,
          reconciliation_json = excluded.reconciliation_json, inventory_counts_json = excluded.inventory_counts_json,
          notes = excluded.notes, created_by = excluded.created_by, updated_at = excluded.updated_at`)
        .run(date, shift, managerOut, managerIn, reconciliation, JSON.stringify(normalizedCounts), notes, req.user?.name || req.user?.username || 'Staff', now, now);
    });
    saveHandover();
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Shift handover could not be saved.' });
  }
  broadcast('business:updated', { type: 'shift_handover_saved', date, shift });
  if (countedInventoryIds.length) broadcast('inventory:updated', { action: 'handover-counted', items: countedInventoryIds });
  res.json({ date, shift, managerOut, managerIn, reconciliation: req.body.reconciliation, inventoryCounts: decorateInventoryCounts(normalizedCounts, req.user.id), notes, updatedAt: now, updatedInventoryItems: updatedInventoryIds.length });
});

router.get('/expenses', authMiddleware, (_req, res) => {
  res.json(db.prepare('SELECT * FROM business_expenses ORDER BY expense_date DESC, id DESC LIMIT 100').all());
});

router.get('/deletion-audit', authMiddleware, deletionViewer, (req, res) => {
  const rows = db.prepare('SELECT * FROM deletion_audit ORDER BY deleted_at DESC LIMIT 500').all();
  res.json(rows.map((row) => ({ ...row, deletedSnapshot: JSON.parse(row.deleted_snapshot || '{}') })));
});

router.post('/expenses', authMiddleware, (req, res) => {
  const { expenseDate, category, description, supplier, amount, paymentMethod, receiptRef } = req.body || {};
  if (!expenseDate || !category || !description || !Number(amount) || Number(amount) < 0) {
    return res.status(400).json({ error: 'Date, category, description, and a positive amount are required.' });
  }
  const result = db.prepare(`INSERT INTO business_expenses
    (expense_date, category, description, supplier, amount, payment_method, status, receipt_ref, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
    expenseDate, category, description, supplier || null, Number(amount), paymentMethod || 'bank', receiptRef || null,
    req.user?.name || 'Admin', new Date().toISOString()
  );
  const expense = db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(result.lastInsertRowid);
  broadcast('business:updated', { type: 'expense_created' });
  res.status(201).json(expense);
});

router.put('/expenses/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { expenseDate, category, description, supplier, amount, paymentMethod, receiptRef } = req.body || {};
  if (!expenseDate || !category || !description || !Number(amount) || Number(amount) < 0) {
    return res.status(400).json({ error: 'Date, category, description, and a positive amount are required.' });
  }
  const result = db.prepare(`UPDATE business_expenses
    SET expense_date = ?, category = ?, description = ?, supplier = ?, amount = ?, payment_method = ?, receipt_ref = ?
    WHERE id = ?`).run(
    expenseDate, category, description, supplier || null, Number(amount), paymentMethod || 'bank', receiptRef || null, req.params.id
  );
  if (!result.changes) return res.status(404).json({ error: 'Expense not found.' });
  broadcast('business:updated', { type: 'expense_updated' });
  res.json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id));
});

router.delete('/expenses/:id', authMiddleware, deletionViewer, requireAdilaDeletion, (req, res) => {
  const existing = db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found.' });
  recordDeletion({ resourceType: 'business_expense', resourceId: existing.id, snapshot: existing, reason: req.body?.reason, user: req.user });
  db.prepare('DELETE FROM business_expenses WHERE id = ?').run(existing.id);
  broadcast('business:updated', { type: 'expense_deleted' });
  res.json({ ok: true, deleted: true, id: existing.id });
});

router.patch('/expenses/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid expense status.' });
  db.prepare('UPDATE business_expenses SET status = ? WHERE id = ?').run(status, req.params.id);
  broadcast('business:updated', { type: 'expense_status' });
  res.json(db.prepare('SELECT * FROM business_expenses WHERE id = ?').get(req.params.id));
});

export default router;
