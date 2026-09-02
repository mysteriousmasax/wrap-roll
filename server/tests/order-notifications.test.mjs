import assert from 'node:assert/strict';
import { buildOrderConfirmationMessage } from '../utils/orderNotifications.js';

assert.equal(buildOrderConfirmationMessage('WR-2024', 'WhatsApp', 'Nuru').includes('WR-2024'), true);
assert.equal(buildOrderConfirmationMessage('WR-2024', 'Email', 'Nuru').includes('Email'), true);
console.log('order notification checks passed');
