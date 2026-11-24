import db from '../db/database.js';
import { broadcast } from '../ws.js';
import { awardRollPoints } from './rollPoints.js';
import { getStockUnitConversionFactor } from '../../src/utils/stockUnits.js';
import { getStorageAfterConsumption, inventoryStorageColumns } from './inventoryStorage.js';
import { recordInventoryStockAlerts } from './inventoryStockAlerts.js';
import { recordInventoryMovement } from './inventoryMovements.js';

function parseIngredients(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deductInventory(orderId, menuItemId, itemName, ingredients, qty, orderType, now, stockNotifications) {
  if (!menuItemId) return;
  const menuItem = db.prepare('SELECT id, name FROM menu_items WHERE id = ?').get(menuItemId);
  if (!menuItem) return;
  for (const ingredient of parseIngredients(ingredients)) {
    if (!ingredient || typeof ingredient !== 'object') continue;
    if (ingredient.takeoutOnly && !['takeout', 'delivery'].includes(orderType)) continue;
    const inventoryId = ingredient.inventoryId ?? ingredient.inventory_id ?? ingredient.id ?? null;
    const name = String(ingredient.inventoryName || ingredient.inventory_name || ingredient.name || ingredient.item || '').trim();
    const amount = Number(ingredient.quantity ?? ingredient.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    let inventoryItem = inventoryId ? db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(inventoryId)) : null;
    if (!inventoryItem && name) {
      inventoryItem = db.prepare('SELECT * FROM inventory WHERE lower(trim(name)) = lower(trim(?)) ORDER BY id DESC LIMIT 1').get(name);
    }
    if (!inventoryItem) continue;
    const conversionFactor = getStockUnitConversionFactor(ingredient.unit || inventoryItem.unit, inventoryItem.unit);
    if (conversionFactor === null) {
      const title = `Recipe unit mismatch: ${inventoryItem.name}`;
      const message = `${menuItem.name} uses ${ingredient.unit || 'an unspecified unit'} for ${inventoryItem.name}, but inventory is measured in ${inventoryItem.unit || 'an unspecified unit'}. Stock was not deducted; update the recipe units.`;
      const existingWarning = db.prepare("SELECT id FROM notifications WHERE title = ? AND message = ? AND read = 0 AND audience_role = 'manager' LIMIT 1")
        .get(title, message);
      if (!existingWarning) {
        db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
          VALUES ('warning', ?, ?, 0, ?, 'manager')`).run(title, message, now);
      }
      continue;
    }
    const deduction = amount * conversionFactor * qty;
    const nextQuantity = Math.max(0, Number(inventoryItem.quantity) - deduction);
    if (deduction <= 0) continue;
    const nextStorage = getStorageAfterConsumption(inventoryItem, deduction, nextQuantity);
    if (nextQuantity !== Number(inventoryItem.quantity)) {
      db.prepare(`UPDATE inventory SET quantity = ?, back_freezer_chiller = ?, refrigerator = ?, front_sandwich = ?, front_pizza = ?, front_burger = ? WHERE id = ?`)
        .run(nextQuantity, nextStorage.back_freezer_chiller, nextStorage.refrigerator, nextStorage.front_sandwich, nextStorage.front_pizza, nextStorage.front_burger, inventoryItem.id);
      db.prepare(`INSERT INTO inventory_audit (inventory_id, action, changed_by_id, changed_by_name, changed_by_role, changes, created_at)
        VALUES (?, 'updated', NULL, 'System', 'system', ?, ?)`)
        .run(inventoryItem.id, JSON.stringify({
          quantity: { from: inventoryItem.quantity, to: nextQuantity },
          storage: Object.fromEntries(inventoryStorageColumns.filter((column) => Number(inventoryItem[column] || 0) !== nextStorage[column]).map((column) => [column, { from: inventoryItem[column] || 0, to: nextStorage[column] }])),
          reason: { from: null, to: `Order fulfillment for ${itemName || menuItem.name}` },
        }), now);
    }
    recordInventoryMovement(db, {
      inventoryId: inventoryItem.id,
      itemName: inventoryItem.name,
      movementType: 'sale_usage',
      quantityBefore: inventoryItem.quantity,
      quantityAfter: nextQuantity,
      unitBefore: inventoryItem.unit,
      referenceType: 'order',
      referenceId: orderId,
      note: `Recipe demand ${deduction} ${inventoryItem.unit}; deducted ${Number(inventoryItem.quantity) - nextQuantity}, unfilled ${Math.max(0, deduction - Number(inventoryItem.quantity))} for ${itemName || menuItem.name}`,
      createdAt: now,
    });
    stockNotifications.push(...recordInventoryStockAlerts(
      inventoryItem,
      { ...inventoryItem, quantity: nextQuantity },
      `after preparing ${menuItem.name}`,
      now
    ));
    broadcast('inventory:updated', { itemId: inventoryItem.id, action: 'order-deducted', shortfall: nextQuantity === 0 });
  }
}

export function applyOrderFulfillmentEffects(orderId, { allowInvoiceTerms = false } = {}) {
  const now = new Date().toISOString();
  const stockNotifications = [];
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
      for (const item of items) deductInventory(orderId, item.menu_item_id, item.name, item.ingredients, Number(item.qty), order.order_type, now, stockNotifications);

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
  const result = apply();
  stockNotifications.forEach((notification) => broadcast('notification:created', notification));
  const order = db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(orderId);
  if (order && ['paid', 'completed'].includes(order.payment_status)) awardRollPoints(orderId);
  return result;
}