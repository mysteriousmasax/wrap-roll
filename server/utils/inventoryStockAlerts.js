import db from '../db/database.js';

export function recordInventoryStockAlerts(previous, next, reason, now = new Date().toISOString()) {
  const previousQuantity = previous ? Number(previous.quantity) : null;
  const nextQuantity = Number(next.quantity);
  const previousThreshold = previous ? Number(previous.threshold || 0) : null;
  const nextThreshold = Number(next.threshold || 0);
  const notifications = [];

  if (Number.isFinite(nextQuantity) && nextQuantity <= 0 && (previousQuantity === null || previousQuantity > 0)) {
    notifications.push({
      type: 'error',
      title: `Out of stock: ${next.name}`,
      message: `${next.name} is out of stock${reason ? ` (${reason})` : ''}. Restock is needed before it can be used.`,
    });
  } else if (
    Number.isFinite(nextQuantity)
    && nextQuantity <= nextThreshold
    && (previousQuantity === null || previousQuantity > previousThreshold)
  ) {
    notifications.push({
      type: 'warning',
      title: `Low stock: ${next.name}`,
      message: `${next.name} is at ${nextQuantity} ${next.unit || ''}${reason ? ` ${reason}` : ''}. Reorder threshold: ${nextThreshold}.`,
    });
  }

  for (const notification of notifications) {
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(notification.type, notification.title, notification.message, now);
  }
  return notifications;
}
