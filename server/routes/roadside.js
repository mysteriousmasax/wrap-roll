import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { getOrderById } from '../utils/orders.js';
import { createRoadsideAccessToken, hashRoadsideAccessToken } from '../utils/roadsideAccess.js';
import { enqueueOrderEmail } from '../utils/orderEmailService.js';

const router = Router();
const staffRoles = ['admin', 'manager', 'foh'];

function tripForOrder(orderId) {
  return db.prepare('SELECT * FROM roadside_trips WHERE order_id = ?').get(orderId);
}

function hasTripAccess(req, trip) {
  const supplied = String(req.get('x-roadside-token') || req.body?.accessToken || '');
  if (!trip || !supplied) return false;
  const expected = Buffer.from(trip.access_token_hash, 'hex');
  const actual = Buffer.from(hashRoadsideAccessToken(supplied), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function canFulfill(order) {
  return order && order.fulfillment_mode === 'roadside_handoff'
    && (order.payment_status === 'paid' || order.payment_terms === 'invoice')
    && ['confirmed', 'released'].includes(order.reservation_status);
}

function roadsideGeofence() {
  const settings = db.prepare(`SELECT key, value FROM settings WHERE key IN
    ('roadside_pickup_latitude', 'roadside_pickup_longitude', 'roadside_arrival_radius_meters')`).all();
  const values = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  const numberOr = (key, fallback) => {
    const raw = values[key];
    if (raw == null || String(raw).trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    latitude: Math.max(-90, Math.min(90, numberOr('roadside_pickup_latitude', -6.7594617))),
    longitude: Math.max(-180, Math.min(180, numberOr('roadside_pickup_longitude', 39.2517226))),
    radius: Math.max(50, Math.min(1000, numberOr('roadside_arrival_radius_meters', 250))),
  };
}

function distanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const arc = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function releaseRoadsideOrder(orderId, actorUserId = null, source = 'geofence') {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!canFulfill(order)) throw new Error('Only paid or approved-company roadside orders can be released.');
  if (order.kitchen_released_at) return getOrderById(orderId);
  const now = new Date().toISOString();
  const release = db.transaction(() => {
    db.prepare(`UPDATE orders SET reservation_status = 'released', kitchen_released_at = ?,
      scheduled_release_at = ?, updated_at = ? WHERE id = ? AND kitchen_released_at IS NULL`)
      .run(now, now, now, orderId);
    db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
      VALUES (?, 'roadside_kitchen_released', 'released', ?, ?, ?)`)
      .run(orderId, actorUserId, now, JSON.stringify({ source }));
    for (const role of ['kitchen', 'foh']) {
      db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
        VALUES ('info', ?, ?, 0, ?, ?)`)
        .run(`Roadside order nearby: ${order.order_number || order.id}`, `${order.customer_name || 'Customer'} is near the pickup point. Start preparing the roadside order.`, now, role);
    }
  });
  release.immediate();
  const updatedOrder = getOrderById(orderId);
  broadcast('order:updated', updatedOrder);
  broadcast('roadside:updated', { orderId, status: 'nearby' });
  broadcast('notification:created', {
    type: 'info',
    title: `Roadside order nearby: ${order.order_number || order.id}`,
    message: `${order.customer_name || 'Customer'} is near the pickup point.`,
    audienceRoles: ['kitchen', 'foh'],
  });
  return updatedOrder;
}

router.get('/active', authMiddleware, requireRole(...staffRoles), (_req, res) => {
  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM roadside_location_points WHERE trip_id IN
    (SELECT id FROM roadside_trips WHERE status IN ('completed', 'cancelled') AND ended_at < ?)`)
    .run(retentionCutoff);
  const trips = db.prepare(`SELECT t.*, o.order_number, o.order_type, o.customer_name, o.customer_phone,
      o.customer_email, o.delivery_address, o.delivery_scheduled_for AS scheduled_for,
      o.payment_status, o.payment_terms, o.reservation_status, o.kitchen_released_at, o.status AS order_status,
      u.name AS runner_name
    FROM roadside_trips t JOIN orders o ON o.id = t.order_id
    LEFT JOIN users u ON u.id = t.runner_user_id
    WHERE t.status != 'cancelled' AND (t.status != 'completed' OR t.updated_at >= datetime('now', '-1 day'))
    ORDER BY t.updated_at DESC`).all();
  res.json(trips.map((trip) => ({
    id: trip.id,
    orderId: trip.order_id,
    orderNumber: trip.order_number || trip.order_id,
    customer: trip.customer_name,
    customerPhone: trip.customer_phone,
    customerEmail: trip.customer_email,
    address: trip.delivery_address,
    orderStatus: trip.order_status,
    reservationStatus: trip.reservation_status,
    kitchenReleasedAt: trip.kitchen_released_at,
    paymentStatus: trip.payment_status,
    status: trip.status,
    consentedAt: trip.consented_at,
    startedAt: trip.started_at,
    endedAt: trip.ended_at,
    latitude: trip.last_latitude,
    longitude: trip.last_longitude,
    accuracy: trip.last_accuracy,
    heading: trip.last_heading,
    speed: trip.last_speed,
    locationAt: trip.last_location_at,
    runnerUserId: trip.runner_user_id,
    runnerName: trip.runner_name,
    rating: trip.rating,
    order: getOrderById(trip.order_id),
    trail: db.prepare(`SELECT latitude, longitude, accuracy, recorded_at AS recordedAt
      FROM roadside_location_points WHERE trip_id = ? ORDER BY recorded_at DESC LIMIT 200`).all(trip.id).reverse(),
  })));
});

router.get('/:orderId/customer', (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!trip || !order || !hasTripAccess(req, trip)) return res.status(404).json({ error: 'Roadside order not found.' });
  res.json({
    id: order.id,
    orderNumber: order.order_number || order.id,
    customer: order.customer_name,
    type: order.order_type,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentTerms: order.payment_terms,
    reservationStatus: order.reservation_status,
    fulfillmentMode: order.fulfillment_mode,
    scheduledFor: order.delivery_scheduled_for,
    tripStatus: trip.status,
    rating: trip.rating,
    items: db.prepare('SELECT name, qty FROM order_items WHERE order_id = ?').all(order.id),
  });
});

router.post('/:orderId/share-link', authMiddleware, requireRole(...staffRoles), (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!trip || !canFulfill(order)) return res.status(404).json({ error: 'Paid roadside order not found.' });
  const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://wrapandrolltz.com').replace(/\/+$/, '');
  res.json({ url: `${baseUrl}/roadside-track/${encodeURIComponent(order.id)}#${createRoadsideAccessToken(order.id)}` });
});

router.post('/:orderId/start', (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!trip || !order || !hasTripAccess(req, trip)) return res.status(404).json({ error: 'Roadside order not found.' });
  if (!canFulfill(order)) return res.status(409).json({ error: 'Tracking becomes available after payment is confirmed.' });
  if (!['awaiting_customer', 'tracking', 'assigned'].includes(trip.status)) return res.status(409).json({ error: 'This tracking session has ended.' });

  const now = new Date().toISOString();
  const status = trip.status === 'assigned' ? 'assigned' : 'tracking';
  db.prepare(`UPDATE roadside_trips SET status = ?, consented_at = COALESCE(consented_at, ?),
    started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`).run(status, now, now, now, trip.id);
  broadcast('roadside:updated', { orderId: order.id, status });
  res.json({ ok: true, status, startedAt: trip.started_at || now });
});

router.post('/:orderId/location', (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!trip || !order || !hasTripAccess(req, trip)) return res.status(404).json({ error: 'Roadside order not found.' });
  if (!canFulfill(order) || !['tracking', 'assigned'].includes(trip.status)) return res.status(409).json({ error: 'Live tracking is not active.' });

  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  const accuracy = Number(req.body?.accuracy);
  const heading = req.body?.heading == null ? null : Number(req.body.heading);
  const speed = req.body?.speed == null ? null : Number(req.body.speed);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'A valid location is required.' });
  }
  if (Number.isFinite(accuracy) && accuracy > 500) return res.status(422).json({ error: 'Location accuracy is too low.' });
  const now = new Date().toISOString();
  if (trip.last_location_at && Date.now() - new Date(trip.last_location_at).getTime() < 4000) {
    return res.status(429).json({ error: 'Location updates are arriving too quickly.' });
  }

  const savePoint = db.transaction(() => {
    db.prepare(`INSERT INTO roadside_location_points (trip_id, latitude, longitude, accuracy, heading, speed, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(trip.id, latitude, longitude,
      Number.isFinite(accuracy) ? accuracy : null,
      Number.isFinite(heading) ? heading : null,
      Number.isFinite(speed) ? speed : null,
      now);
    db.prepare(`UPDATE roadside_trips SET last_latitude = ?, last_longitude = ?, last_accuracy = ?,
      last_heading = ?, last_speed = ?, last_location_at = ?, updated_at = ? WHERE id = ?`)
      .run(latitude, longitude, Number.isFinite(accuracy) ? accuracy : null,
        Number.isFinite(heading) ? heading : null, Number.isFinite(speed) ? speed : null, now, now, trip.id);
    db.prepare(`DELETE FROM roadside_location_points WHERE trip_id = ? AND id NOT IN
      (SELECT id FROM roadside_location_points WHERE trip_id = ? ORDER BY recorded_at DESC LIMIT 2000)`)
      .run(trip.id, trip.id);
  });
  savePoint();
  const currentOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  if (currentOrder.reservation_status === 'confirmed' && !currentOrder.kitchen_released_at) {
    const geofence = roadsideGeofence();
    const distance = distanceMeters(latitude, longitude, geofence.latitude, geofence.longitude);
    if (distance <= geofence.radius) releaseRoadsideOrder(order.id, null, 'geofence');
  }
  broadcast('roadside:updated', { orderId: order.id, status: trip.status });
  res.json({ ok: true, recordedAt: now });
});

router.post('/:orderId/stop', (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  if (!trip || !hasTripAccess(req, trip)) return res.status(404).json({ error: 'Roadside order not found.' });
  if (!['tracking', 'assigned'].includes(trip.status)) return res.status(409).json({ error: 'Live tracking is not active.' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE roadside_trips SET status = 'tracking_stopped', ended_at = ?, updated_at = ? WHERE id = ?`).run(now, now, trip.id);
  broadcast('roadside:updated', { orderId: trip.order_id, status: 'tracking_stopped' });
  res.json({ ok: true, status: 'tracking_stopped' });
});

router.post('/:orderId/rating', (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  if (!trip || !hasTripAccess(req, trip)) return res.status(404).json({ error: 'Roadside order not found.' });
  if (trip.status !== 'completed') return res.status(409).json({ error: 'You can rate the handoff after it is completed.' });
  const rating = Number(req.body?.rating);
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Choose a rating from 1 to 5.' });
  if (trip.rating != null) return res.status(409).json({ error: 'A rating has already been submitted.' });
  const now = new Date().toISOString();
  db.prepare('UPDATE roadside_trips SET rating = ?, rating_comment = ?, rated_at = ?, updated_at = ? WHERE id = ?')
    .run(rating, comment || null, now, now, trip.id);
  res.json({ ok: true, rating });
});

router.patch('/:orderId/runner', authMiddleware, requireRole(...staffRoles), (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  if (!trip || ['completed', 'cancelled'].includes(trip.status)) return res.status(404).json({ error: 'Active roadside order not found.' });
  const runnerUserId = req.body?.runnerUserId == null ? null : Number(req.body.runnerUserId);
  const runner = runnerUserId == null ? null : db.prepare('SELECT id, role FROM users WHERE id = ?').get(runnerUserId);
  if (runnerUserId != null && (!runner || !['foh', 'admin', 'manager'].includes(String(runner.role || '').toLowerCase()))) {
    return res.status(400).json({ error: 'Choose an active FOH or delivery staff member.' });
  }
  const status = trip.status === 'tracking_stopped' && !runnerUserId
    ? 'tracking_stopped'
    : runnerUserId ? 'assigned' : (trip.last_location_at ? 'tracking' : 'awaiting_customer');
  const now = new Date().toISOString();
  db.prepare('UPDATE roadside_trips SET runner_user_id = ?, status = ?, updated_at = ? WHERE id = ?').run(runnerUserId, status, now, trip.id);
  broadcast('roadside:updated', { orderId: trip.order_id, status });
  res.json({ ok: true, status, runnerUserId });
});

router.post('/:orderId/release-kitchen', authMiddleware, requireRole(...staffRoles), (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
    if (!order || order.fulfillment_mode !== 'roadside_handoff') return res.status(404).json({ error: 'Roadside order not found.' });
    const released = releaseRoadsideOrder(order.id, req.user.id, 'staff_override');
    res.json(released);
  } catch (error) {
    res.status(409).json({ error: error.message || 'Roadside order could not be released.' });
  }
});

router.post('/:orderId/handoff', authMiddleware, requireRole(...staffRoles), (req, res) => {
  const trip = tripForOrder(req.params.orderId);
  if (!trip || ['completed', 'cancelled'].includes(trip.status)) return res.status(404).json({ error: 'Active roadside order not found.' });
  const now = new Date().toISOString();
  const completeHandoff = db.transaction(() => {
    db.prepare(`UPDATE roadside_trips SET status = 'completed', ended_at = COALESCE(ended_at, ?), updated_at = ? WHERE id = ?`).run(now, now, trip.id);
    db.prepare(`UPDATE orders SET status = 'completed', reservation_status = 'fulfilled', updated_at = ? WHERE id = ?`).run(now, trip.order_id);
    db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
      VALUES (?, 'roadside_handoff_completed', 'completed', ?, ?, '{}')`).run(trip.order_id, req.user.id, now);
  });
  completeHandoff();
  const order = getOrderById(trip.order_id);
  if (order?.customerEmail) {
    try { enqueueOrderEmail(order.id, `roadside_handoff:${Date.now()}`); }
    catch (error) { console.error(`Could not queue roadside rating email for ${order.id}:`, error.message); }
  }
  broadcast('roadside:updated', { orderId: trip.order_id, status: 'completed' });
  broadcast('order:updated', order);
  res.json({ ok: true, status: 'completed' });
});

export default router;