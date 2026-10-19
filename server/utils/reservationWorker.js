import db from '../db/database.js';
import { broadcast } from '../ws.js';
import { getOrderById } from './orders.js';
import { getReservationReleaseTime } from './reservationTiming.js';

const notifiedRoles = ['kitchen', 'foh', 'manager'];

export function processDueReservations(now = new Date()) {
  const nowIso = now.toISOString();
  const scheduledOrders = db.prepare(`SELECT id, delivery_scheduled_for, scheduled_release_at FROM orders
    WHERE delivery_scheduled_for IS NOT NULL AND kitchen_released_at IS NULL
      AND reservation_status IN ('awaiting_payment', 'confirmed')
      AND status NOT IN ('cancelled', 'completed')`).all();
  const updateSchedule = db.prepare('UPDATE orders SET scheduled_release_at = ? WHERE id = ?');
  scheduledOrders.forEach((order) => {
    const releaseAt = getReservationReleaseTime(order.delivery_scheduled_for);
    if (order.scheduled_release_at !== releaseAt) updateSchedule.run(releaseAt, order.id);
  });
  const dueOrders = db.prepare(`SELECT id, order_number, customer_name, delivery_scheduled_for
    FROM orders
    WHERE reservation_status = 'confirmed'
      AND status NOT IN ('cancelled', 'completed')
      AND delivery_scheduled_for IS NOT NULL AND scheduled_release_at <= ?
      AND kitchen_released_at IS NULL
      AND (payment_status IN ('paid', 'completed') OR payment_terms = 'invoice')
    ORDER BY scheduled_release_at ASC`).all(nowIso);
  const releasedOrders = [];

  for (const order of dueOrders) {
    const release = db.transaction(() => {
      const result = db.prepare(`UPDATE orders SET reservation_status = 'released', kitchen_released_at = ?, scheduled_release_at = ?, updated_at = ?
        WHERE id = ? AND reservation_status = 'confirmed' AND scheduled_release_at <= ?
          AND kitchen_released_at IS NULL AND status NOT IN ('cancelled', 'completed')
          AND (payment_status IN ('paid', 'completed') OR payment_terms = 'invoice')`)
        .run(nowIso, nowIso, nowIso, order.id, nowIso);
      if (!result.changes) return false;

      db.prepare(`INSERT INTO order_events (order_id, event_type, status, occurred_at, metadata)
        VALUES (?, 'reservation_kitchen_released', 'released', ?, ?)`)
        .run(order.id, nowIso, JSON.stringify({ scheduledFor: order.delivery_scheduled_for, source: 'scheduler' }));

      const orderNumber = order.order_number || order.id;
      const title = `Scheduled order ready for kitchen: ${orderNumber}`;
      const message = `Order ${orderNumber} for ${order.customer_name || 'Customer'} is scheduled for ${new Date(order.delivery_scheduled_for).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' })}. Begin preparation now.`;
      const insertNotification = db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
        VALUES ('info', ?, ?, 0, ?, ?)`);
      notifiedRoles.forEach((role) => insertNotification.run(title, message, nowIso, role));
      return { id: order.id, orderNumber, title, message };
    });

    const result = release();
    if (!result) continue;
    releasedOrders.push(result);
    broadcast('order:updated', getOrderById(result.id));
    broadcast('notification:created', {
      type: 'info',
      title: result.title,
      message: result.message,
      audienceRoles: notifiedRoles,
    });
  }

  return releasedOrders;
}

export function startReservationWorker(intervalMs = 15000) {
  const run = () => {
    try {
      processDueReservations();
    } catch (error) {
      console.error('Scheduled reservation release failed:', error);
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}