import db from '../db/database.js';
import { broadcast } from '../ws.js';

function parseIngredients(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deductInventory(menuItemId, itemName, ingredients, qty, now) {
  if (!menuItemId) return;
  const menuItem = db.prepare('SELECT id, name FROM menu_items WHERE id = ?').get(menuItemId);
  if (!menuItem) return;
  for (const ingredient of parseIngredients(ingredients)) {
    if (!ingredient || typeof ingredient !== 'object') continue;
    const inventoryId = ingredient.inventoryId ?? ingredient.inventory_id ?? ingredient.id ?? null;
    const name = String(ingredient.inventoryName || ingredient.inventory_name || ingredient.name || ingredient.item || '').trim();
    const amount = Number(ingredient.quantity ?? ingredient.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    let inventoryItem = inventoryId ? db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(inventoryId)) : null;
    if (!inventoryItem && name) {
      inventoryItem = db.prepare('SELECT * FROM inventory WHERE lower(trim(name)) = lower(trim(?)) ORDER BY id DESC LIMIT 1').get(name);
    }
    if (!inventoryItem) continue;
    const nextQuantity = Math.max(0, Number(inventoryItem.quantity) - amount * qty);
    if (nextQuantity === Number(inventoryItem.quantity)) continue;
    db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?').run(nextQuantity, inventoryItem.id);
    db.prepare(`INSERT INTO inventory_audit (inventory_id, action, changed_by_id, changed_by_name, changed_by_role, changes, created_at)
      VALUES (?, 'updated', NULL, 'System', 'system', ?, ?)`)
      .run(inventoryItem.id, JSON.stringify({
        quantity: { from: inventoryItem.quantity, to: nextQuantity },
        reason: { from: null, to: `Order fulfillment for ${itemName || menuItem.name}` },
      }), now);
    if (nextQuantity === 0 && Number(inventoryItem.quantity) < amount * qty) {
      db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
        VALUES ('warning', ?, ?, 0, ?, 'manager')`)
        .run(`Low stock: ${inventoryItem.name}`, `${inventoryItem.name} ran out while preparing ${menuItem.name}. Reconcile inventory.`, now);
    }
    broadcast('inventory:updated', { itemId: inventoryItem.id, action: 'order-deducted', shortfall: nextQuantity === 0 });
  }
}

export function applyOrderFulfillmentEffects(orderId, { allowInvoiceTerms = false } = {}) {
  const now = new Date().toISOString();
  const apply = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return false;
    const paid = ['paid', 'completed'].includes(order.payment_status);
    const eligibleForPreparation = allowInvoiceTerms
      && ['preparing', 'ready', 'completed'].includes(order.status)
      && (order.order_type === 'dine-in-postpay' || (order.payment_terms === 'invoice' && ['confirmed', 'released'].includes(order.reservation_status)));
    if (!order.fulfillment_effects_applied_at && !paid && !eligibleForPreparation) return false;

    if (!order.fulfillment_effects_applied_at) {
      const items = db.prepare('SELECT menu_item_id, name, qty, ingredients FROM order_items WHERE order_id = ?').all(orderId);
      for (const item of items) deductInventory(item.menu_item_id, item.name, item.ingredients, Number(item.qty), now);

      if (order.customer_id) {
        const favoriteItems = items.map((item) => item.name).filter(Boolean);
        db.prepare('UPDATE customers SET last_visit = ?, visits = visits + 1, favorite_items = ? WHERE id = ?')
          .run(now.slice(0, 10), JSON.stringify(favoriteItems), order.customer_id);
      }
      db.prepare('UPDATE orders SET fulfillment_effects_applied_at = ? WHERE id = ?').run(now, orderId);
    }

    if (paid && !order.customer_value_applied_at) {
      if (order.customer_id) db.prepare('UPDATE customers SET lifetime_value = lifetime_value + ? WHERE id = ?').run(Number(order.total || 0), order.customer_id);
      db.prepare('UPDATE orders SET customer_value_applied_at = ? WHERE id = ?').run(now, orderId);
    }
    return true;
  });
  return apply();
}