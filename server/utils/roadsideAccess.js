import crypto from 'node:crypto';
import { JWT_SECRET } from '../middleware/auth.js';

export function createRoadsideAccessToken(orderId) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`roadside:${orderId}`).digest('base64url');
}

export function createCustomerOrderTrackingToken(orderId) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`customer-order:${orderId}`).digest('base64url');
}

export function hashRoadsideAccessToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
