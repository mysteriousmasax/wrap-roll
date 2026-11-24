import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'wrap-roll-dine-in-'));
process.env.DB_PATH = path.join(tempDir, 'wraproll.db');
process.env.JWT_SECRET = 'isolated-dine-in-workflow-test-secret';

const { default: db, initDatabase } = await import('../db/database.js');
const { default: orderRoutes } = await import('../routes/orders.js');
const { default: tableRoutes } = await import('../routes/tables.js');
const { default: paymentRoutes } = await import('../routes/payments.js');
const { signToken } = await import('../middleware/auth.js');

test('POS and table QR tickets share a kitchen-first tab that can only be released after settlement', async () => {
  let server;
  try {
    await initDatabase();
    const user = db.prepare("SELECT id, name, role FROM users WHERE lower(role) = 'foh' LIMIT 1").get()
      || {
        id: db.prepare("INSERT INTO users (name, role, pin) VALUES ('Dine-in test', 'foh', 'test')").run().lastInsertRowid,
        name: 'Dine-in test',
        role: 'foh',
      };
    const manager = {
      id: db.prepare("INSERT INTO users (name, role, pin, username) VALUES ('Dine-in manager test', 'manager', 'test', 'dine.manager.test')").run().lastInsertRowid,
      name: 'Dine-in manager test',
      role: 'manager',
    };
    const token = signToken(user);
    const managerToken = signToken(manager);
    const menuItemId = db.prepare("INSERT INTO menu_items (name, price, category, active) VALUES ('Dine-in workflow test item', 1000, 'Tests', 1)").run().lastInsertRowid;
    db.prepare("INSERT INTO settings (key, value) VALUES ('tax_rate', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
    const tableId = db.prepare("INSERT INTO tables (number, seats, status, tag_id) VALUES (991, 4, 'available', 'TEST-DINE-991')").run().lastInsertRowid;

    const app = express();
    app.use(express.json());
    app.use('/api/orders', orderRoutes);
    app.use('/api/tables', tableRoutes);
    app.use('/api/payments', paymentRoutes);
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const managerHeaders = { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' };
    const createOrder = async (pathName, body, staff = false) => {
      const response = await fetch(`${base}/orders${pathName}`, {
        method: 'POST',
        headers: staff ? headers : { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      assert.equal(response.status, 201, data.error);
      return data;
    };

    const staffOrder = await createOrder('', {
      items: [{ menuItemId, qty: 1 }],
      orderType: 'dine-in',
      tableNumber: 991,
      paymentMethod: 'cash',
      paymentTiming: 'paid-cash',
    }, true);
    const firstTable = db.prepare('SELECT status, current_tab_id FROM tables WHERE id = ?').get(tableId);
    assert.equal(firstTable.status, 'occupied');
    assert.equal(firstTable.current_tab_id, staffOrder.tabId);
    assert.equal(staffOrder.status, 'confirmed');
    assert.equal(staffOrder.paymentStatus, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM payments WHERE order_id = ?').get(staffOrder.id).count, 0);

    const releaseResponse = await fetch(`${base}/tables/${tableId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'available' }),
    });
    assert.equal(releaseResponse.status, 409);

    const publicTable = await fetch(`${base}/tables/public/TEST-DINE-991`);
    assert.equal(publicTable.status, 200);
    assert.equal((await publicTable.json()).hasOpenTab, true);

    const qrOrder = await createOrder('/public', {
      items: [{ menuItemId, qty: 1 }],
      orderType: 'dine-in',
      tableNumber: 991,
      tableTagId: 'TEST-DINE-991',
    });
    assert.equal(qrOrder.tabId, staffOrder.tabId);
    assert.equal(qrOrder.status, 'confirmed');
    assert.equal(qrOrder.paymentStatus, 'pending');
    assert.equal(qrOrder.customer, null);

    const tableListResponse = await fetch(`${base}/tables`, { headers });
    assert.equal(tableListResponse.status, 200);
    const tableWithTickets = (await tableListResponse.json()).find((table) => table.id === tableId);
    assert.equal(tableWithTickets.tickets.length, 2);
    assert.deepEqual(tableWithTickets.tickets[0].items, [{ name: 'Dine-in workflow test item', quantity: 1 }]);
    assert.equal(tableWithTickets.tickets[0].orderedBy, user.name);
    assert.ok(tableWithTickets.tickets[0].createdAt);
    assert.equal(tableWithTickets.tickets[1].orderedBy, '');

    const customerDetailsResponse = await fetch(`${base}/tables/${tableId}/tab/customer`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        customerName: '  Dine-in Guest  ',
        customerPhone: '+255 712 345 678',
        customerEmail: 'guest@example.com',
      }),
    });
    assert.equal(customerDetailsResponse.status, 200);
    const updatedCustomerTab = await customerDetailsResponse.json();
    assert.equal(updatedCustomerTab.customerName, 'Dine-in Guest');
    assert.equal(updatedCustomerTab.customerPhone, '+255712345678');
    assert.equal(updatedCustomerTab.customerEmail, 'guest@example.com');
    assert.deepEqual(
      db.prepare('SELECT customer_name, customer_phone, customer_email FROM orders WHERE dine_in_tab_id = ? ORDER BY created_at, id').all(staffOrder.tabId),
      [
        { customer_name: 'Dine-in Guest', customer_phone: '+255712345678', customer_email: 'guest@example.com' },
        { customer_name: 'Dine-in Guest', customer_phone: '+255712345678', customer_email: 'guest@example.com' },
      ],
      'customer details entered at payment time are saved to each ticket on the tab',
    );
    const invalidCustomerEmail = await fetch(`${base}/tables/${tableId}/tab/customer`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ customerName: 'Dine-in Guest', customerPhone: '+255712345678', customerEmail: 'invalid' }),
    });
    assert.equal(invalidCustomerEmail.status, 400);

    const paymentIntent = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: qrOrder.id }),
    });
    assert.equal(paymentIntent.status, 409);

    for (const order of [staffOrder, qrOrder]) {
      const response = await fetch(`${base}/orders/${encodeURIComponent(order.id)}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'completed' }),
      });
      assert.equal(response.status, 200);
    }

    const servedTablesResponse = await fetch(`${base}/tables`, { headers });
    const servedTable = (await servedTablesResponse.json()).find((table) => table.id === tableId);
    assert.equal(servedTable.tickets[0].servedBy, user.name);
    assert.ok(servedTable.tickets[0].servedAt);

    const tabResponse = await fetch(`${base}/tables/${tableId}/tab`, { headers });
    const tab = await tabResponse.json();
    assert.equal(tab.balanceDue, 2000);
    const paymentResponse = await fetch(`${base}/tables/${tableId}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ payments: [{ amount: 1000, method: 'cash' }, { amount: 1000, method: 'card' }] }),
    });
    assert.equal(paymentResponse.status, 200);
    const paymentResult = await paymentResponse.json();
    assert.equal(paymentResult.tab.balanceDue, 0);
    assert.equal(paymentResult.tab.status, 'closed');
    assert.equal(paymentResult.tab.payments.length, 2);
    assert.equal(paymentResult.tab.payments.reduce((sum, payment) => sum + payment.amount, 0), 2000);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM payments WHERE received_by_user_id = ?').get(user.id).count, 2);
    const closedTable = db.prepare('SELECT status, current_tab_id FROM tables WHERE id = ?').get(tableId);
    assert.equal(closedTable.status, 'cleaning');
    assert.equal(closedTable.current_tab_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM dine_in_tabs WHERE table_number = 991 AND status = 'open'").get().count, 0);

    const unauthorizedDiscount = await fetch(`${base}/orders`, {
      method: 'POST', headers,
      body: JSON.stringify({ items: [{ menuItemId, qty: 1 }], orderType: 'takeout', paymentMethod: 'cash', discountPercent: 10, discountReason: 'Test' }),
    });
    assert.equal(unauthorizedDiscount.status, 400, 'non-managers cannot apply manual discounts');

    const offerResponse = await fetch(`${base}/orders/offers`, {
      method: 'POST', headers: managerHeaders,
      body: JSON.stringify({ name: 'Manager test offer', discountType: 'percentage', discountValue: 10, eligibleMenuItemIds: [menuItemId], maxUses: 1 }),
    });
    assert.equal(offerResponse.status, 201);
    const offer = await offerResponse.json();
    const stackWithoutApproval = await fetch(`${base}/orders`, {
      method: 'POST', headers: managerHeaders,
      body: JSON.stringify({ items: [{ menuItemId, qty: 1 }], orderType: 'takeout', paymentMethod: 'cash', discountPercent: 10, discountReason: 'Approved staff recovery', promotionId: offer.id }),
    });
    assert.equal(stackWithoutApproval.status, 400, 'stacking requires an explicit manager approval flag');

    const discountedOrderResponse = await fetch(`${base}/orders`, {
      method: 'POST', headers: managerHeaders,
      body: JSON.stringify({ items: [{ menuItemId, qty: 1 }], orderType: 'takeout', paymentMethod: 'cash', discountPercent: 10, discountReason: 'Approved service recovery', promotionId: offer.id, approveStacking: true }),
    });
    assert.equal(discountedOrderResponse.status, 201);
    const discountedOrder = await discountedOrderResponse.json();
    assert.equal(discountedOrder.subtotal, 1000);
    assert.equal(discountedOrder.discountAmount, 200);
    assert.equal(discountedOrder.manualDiscountAmount, 100);
    assert.equal(discountedOrder.offerDiscountAmount, 100);
    assert.equal(discountedOrder.total, 800);
    assert.equal(discountedOrder.discountApprovedByUserId, manager.id);
    assert.equal(db.prepare('SELECT use_count FROM promotions WHERE id = ?').get(offer.id).use_count, 1);
    const exhaustedOfferOrder = await fetch(`${base}/orders`, {
      method: 'POST', headers: managerHeaders,
      body: JSON.stringify({ items: [{ menuItemId, qty: 1 }], orderType: 'takeout', paymentMethod: 'cash', promotionId: offer.id }),
    });
    assert.equal(exhaustedOfferOrder.status, 400, 'offer usage caps are enforced');

    const smallRefundResponse = await fetch(`${base}/orders/${discountedOrder.id}/refunds`, {
      method: 'POST', headers,
      body: JSON.stringify({ paymentId: discountedOrder.payments[0].id, amount: 500, reason: 'Item returned', payoutMethod: 'cash' }),
    });
    assert.equal(smallRefundResponse.status, 200);
    const smallRefundOrder = await smallRefundResponse.json();
    assert.equal(smallRefundOrder.refundableAmount, 300);
    assert.equal(smallRefundOrder.refunds[0].status, 'processed');
    assert.equal(smallRefundOrder.refunds[0].processedBy, user.name);

    const highValueOrderResponse = await fetch(`${base}/orders`, {
      method: 'POST', headers: managerHeaders,
      body: JSON.stringify({ items: [{ menuItemId, qty: 20 }], orderType: 'takeout', paymentMethod: 'cash' }),
    });
    assert.equal(highValueOrderResponse.status, 201);
    const highValueOrder = await highValueOrderResponse.json();
    const refundRequestResponse = await fetch(`${base}/orders/${highValueOrder.id}/refunds`, {
      method: 'POST', headers,
      body: JSON.stringify({ paymentId: highValueOrder.payments[0].id, amount: 15000, reason: 'Customer cancellation' }),
    });
    const refundRequestData = await refundRequestResponse.json();
    assert.equal(refundRequestResponse.status, 202, `refunds above TZS 10,000 require manager approval: ${JSON.stringify(refundRequestData)}`);
    const pendingRefundOrder = refundRequestData;
    assert.equal(pendingRefundOrder.refunds[0].status, 'pending_approval');
    const approveRefundResponse = await fetch(`${base}/orders/${highValueOrder.id}/refunds/${pendingRefundOrder.refunds[0].id}`, {
      method: 'PATCH', headers: managerHeaders,
      body: JSON.stringify({ decision: 'approve', payoutMethod: 'cash' }),
    });
    assert.equal(approveRefundResponse.status, 200);
    const approvedRefundOrder = await approveRefundResponse.json();
    assert.equal(approvedRefundOrder.refunds[0].status, 'processed');
    assert.equal(approvedRefundOrder.refunds[0].approvedBy, manager.name);
    assert.equal(approvedRefundOrder.refundableAmount, 5000);
    const duplicateReviewResponse = await fetch(`${base}/orders/${highValueOrder.id}/refunds/${pendingRefundOrder.refunds[0].id}`, {
      method: 'PATCH', headers: managerHeaders,
      body: JSON.stringify({ decision: 'approve', payoutMethod: 'cash' }),
    });
    assert.equal(duplicateReviewResponse.status, 404, 'a finalized refund cannot be reviewed a second time');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
