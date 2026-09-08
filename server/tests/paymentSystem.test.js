/**
 * Automated Payment & Verification Test Suite for Wrap & Roll
 * Tests all 8 core verification and fraud-prevention scenarios
 */

import db, { initDatabase } from '../db/database.js';
import { manualLipaProvider, genericWebhookProvider } from '../utils/paymentProviders.js';
import { nextOrderId, nextPaymentReference } from '../utils/orders.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING WRAP & ROLL PAYMENT TESTS');
  console.log('========================================\n');

  await initDatabase();

  // Clean test fixtures
  const testOrderRef = 'WRPAY-TEST-001';
  const testOrderId = 'WR-TEST-001';
  const testUnderpayRef = 'WRPAY-TEST-002';
  const testUnderpayId = 'WR-TEST-002';
  const testManualRef = 'WRPAY-TEST-003';
  const testManualId = 'WR-TEST-003';

  db.prepare("DELETE FROM payments WHERE payment_reference LIKE 'WRPAY-TEST%'").run();
  db.prepare("DELETE FROM orders WHERE id LIKE 'WR-TEST%'").run();

  // ----------------------------------------------------
  // SCENARIO 1: Order Creation and Initial Pending State
  // ----------------------------------------------------
  console.log('--- Test 1: Order Creation with Initial Pending State ---');
  const totalAmount = 25000;
  db.prepare(`
    INSERT INTO orders (id, order_type, status, payment_status, subtotal, tax, total, payment_reference, customer_name, customer_phone, order_source, created_at, updated_at)
    VALUES (?, 'delivery', 'pending_payment', 'pending', 23148, 1852, ?, ?, 'Test Customer', '0712345678', 'website', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testOrderId, totalAmount, testOrderRef);

  db.prepare(`
    INSERT INTO payments (id, order_id, payment_reference, provider, payment_method, amount, currency, status, initiated_at, created_at, updated_at)
    VALUES ('PAY-TEST-001', ?, ?, 'lipa_namba', 'lipa_namba', ?, 'TZS', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testOrderId, testOrderRef, totalAmount);

  const initialOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testOrderId);
  const initialPayment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(testOrderRef);

  assert(initialOrder.status === 'pending_payment', 'Order status must be pending_payment');
  assert(initialOrder.payment_status === 'pending', 'Order payment_status must be pending');
  assert(initialPayment.status === 'pending', 'Payment record status must be pending');
  assert(initialPayment.amount === totalAmount, 'Payment amount matches order total');

  // ----------------------------------------------------
  // SCENARIO 2: Generic Webhook with Exact Amount
  // ----------------------------------------------------
  console.log('\n--- Test 2: Webhook Processing with Exact Matching Amount ---');
  const exactWebhookPayload = {
    payment_reference: testOrderRef,
    transaction_id: 'TXN-EXACT-999',
    amount: 25000,
    status: 'COMPLETED',
    sender_phone: '0712345678',
    sender_name: 'Peter Customer',
  };

  const exactResult = await genericWebhookProvider.handleWebhook({ payload: exactWebhookPayload });
  assert(exactResult.success === true, 'Webhook should successfully process exact payment');
  assert(exactResult.status === 'paid', 'Payment status should resolve to paid');

  const paidOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testOrderId);
  const paidPayment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(testOrderRef);

  assert(paidPayment.status === 'paid', 'Database payment record is marked paid');
  assert(paidPayment.transaction_id === 'TXN-EXACT-999', 'Database records transaction ID');
  assert(paidOrder.payment_status === 'paid', 'Order payment_status is updated to paid');
  assert(paidOrder.status === 'confirmed', 'Order is automatically confirmed and released to kitchen');

  // ----------------------------------------------------
  // SCENARIO 3: Underpayment Fraud Attempt
  // ----------------------------------------------------
  console.log('\n--- Test 3: Underpayment Fraud Detection (Attempting to pay 5000 for a 30000 order) ---');
  db.prepare(`
    INSERT INTO orders (id, order_type, status, payment_status, subtotal, tax, total, payment_reference, customer_name, customer_phone, order_source, created_at, updated_at)
    VALUES (?, 'delivery', 'pending_payment', 'pending', 27777, 2223, 30000, ?, 'Fraud Tester', '0711111111', 'website', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testUnderpayId, testUnderpayRef);

  db.prepare(`
    INSERT INTO payments (id, order_id, payment_reference, provider, payment_method, amount, currency, status, initiated_at, created_at, updated_at)
    VALUES ('PAY-TEST-002', ?, ?, 'lipa_namba', 'lipa_namba', 30000, 'TZS', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testUnderpayId, testUnderpayRef);

  const underpayPayload = {
    payment_reference: testUnderpayRef,
    transaction_id: 'TXN-FRAUD-111',
    amount: 5000, // Underpayment!
    status: 'COMPLETED',
    sender_phone: '0711111111',
  };

  const underpayResult = await genericWebhookProvider.handleWebhook({ payload: underpayPayload });
  assert(underpayResult.status === 'manual_review', 'Underpayment must be flagged as manual_review');

  const fraudOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testUnderpayId);
  const fraudPayment = db.prepare('SELECT * FROM payments WHERE payment_reference = ?').get(testUnderpayRef);

  assert(fraudPayment.status === 'manual_review', 'Payment marked as manual_review');
  assert(fraudOrder.status === 'pending_payment', 'Order MUST NOT be confirmed or sent to kitchen');
  assert(fraudOrder.payment_status === 'manual_review', 'Order payment status reflects manual review');

  // ----------------------------------------------------
  // SCENARIO 4: Webhook Idempotency (Duplicate Prevention)
  // ----------------------------------------------------
  console.log('\n--- Test 4: Idempotency Protection for Replayed Webhooks ---');
  const duplicateResult = await genericWebhookProvider.handleWebhook({ payload: exactWebhookPayload });
  assert(duplicateResult.success === true && duplicateResult.duplicate === true, 'Duplicate webhook recognized idempotently without error or double state transition');

  // ----------------------------------------------------
  // SCENARIO 5: Manual Lipa Namba Submission ("I Have Paid")
  // ----------------------------------------------------
  console.log('\n--- Test 5: Customer Manual Claim Submission ---');
  db.prepare(`
    INSERT INTO orders (id, order_type, status, payment_status, subtotal, tax, total, payment_reference, customer_name, customer_phone, order_source, created_at, updated_at)
    VALUES (?, 'delivery', 'pending_payment', 'pending', 16666, 1334, 18000, ?, 'Asha Manual', '0788000111', 'website', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testManualId, testManualRef);

  db.prepare(`
    INSERT INTO payments (id, order_id, payment_reference, provider, payment_method, amount, currency, status, initiated_at, created_at, updated_at)
    VALUES ('PAY-TEST-003', ?, ?, 'lipa_namba', 'lipa_namba', 18000, 'TZS', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testManualId, testManualRef);

  const manualSubmitResult = await manualLipaProvider.submitManualPayment(testManualRef, {
    transactionId: 'MPESA-99AABB',
    senderPhone: '0788000111',
    senderName: 'Asha M',
    notes: 'Paid via Mixx 45342017',
  });

  assert(manualSubmitResult.success === true, 'Customer claim submitted successfully');
  assert(manualSubmitResult.payment.status === 'manual_review', 'Payment status is set to manual_review');

  const claimedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testManualId);
  assert(claimedOrder.status === 'pending_payment', 'Order remains pending_payment until verified by staff');
  assert(claimedOrder.payment_status === 'manual_review', 'Order payment status is manual_review');

  // ----------------------------------------------------
  // SCENARIO 6: Staff Manual Verification and Kitchen Release
  // ----------------------------------------------------
  console.log('\n--- Test 6: Staff Approval and Kitchen Release ---');
  const verifyResult = await manualLipaProvider.verifyManualPayment(testManualRef, {
    verifiedBy: 'Manager Baraka',
    notes: 'Verified against M-Pesa SMS notification',
  });

  assert(verifyResult.success === true, 'Admin manual verification succeeds');
  assert(verifyResult.payment.status === 'paid', 'Payment status is updated to paid');

  const verifiedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(testManualId);
  assert(verifiedOrder.payment_status === 'paid', 'Order payment_status is paid');
  assert(verifiedOrder.status === 'confirmed', 'Order is confirmed and dispatched to kitchen KDS');

  // ----------------------------------------------------
  // SCENARIO 7: Staff Rejection of False/Invalid Claims
  // ----------------------------------------------------
  console.log('\n--- Test 7: Staff Rejection of Fake Payment Claims ---');
  const rejectRef = 'WRPAY-TEST-004';
  const rejectOrderId = 'WR-TEST-004';
  db.prepare(`
    INSERT INTO orders (id, order_type, status, payment_status, subtotal, tax, total, payment_reference, customer_name, customer_phone, order_source, created_at, updated_at)
    VALUES (?, 'delivery', 'pending_payment', 'pending', 13888, 1112, 15000, ?, 'Fake Customer', '0700000000', 'website', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(rejectOrderId, rejectRef);

  db.prepare(`
    INSERT INTO payments (id, order_id, payment_reference, provider, payment_method, amount, currency, status, initiated_at, created_at, updated_at)
    VALUES ('PAY-TEST-004', ?, ?, 'lipa_namba', 'lipa_namba', 15000, 'TZS', 'manual_review', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(rejectOrderId, rejectRef);

  const rejectResult = await manualLipaProvider.rejectManualPayment(rejectRef, {
    verifiedBy: 'Manager Baraka',
    notes: 'No matching transaction in business SMS records',
  });

  assert(rejectResult.success === true, 'Manual rejection executed');
  assert(rejectResult.payment.status === 'failed', 'Payment status marked as failed');

  const rejectedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(rejectOrderId);
  assert(rejectedOrder.payment_status === 'failed', 'Order payment status marked failed');
  assert(rejectedOrder.status === 'pending_payment', 'Order is not dispatched to kitchen');

  // ----------------------------------------------------
  // SCENARIO 8: Helper Function ID Formats
  // ----------------------------------------------------
  console.log('\n--- Test 8: ID and Payment Reference Generators ---');
  const sampleOrderId = nextOrderId();
  const samplePaymentRef = nextPaymentReference(sampleOrderId);
  assert(sampleOrderId.startsWith('WR-'), 'Order ID starts with WR- prefix');
  assert(samplePaymentRef.startsWith('WRPAY-'), 'Payment reference starts with WRPAY- prefix');

  // Clean up fixtures
  db.prepare("DELETE FROM payments WHERE payment_reference LIKE 'WRPAY-TEST%'").run();
  db.prepare("DELETE FROM orders WHERE id LIKE 'WR-TEST%'").run();

  console.log('\n========================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
