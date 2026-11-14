import { Router } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { deletionViewer, recordDeletion } from '../utils/deletionPolicy.js';
import { broadcast } from '../ws.js';
import { getOrderById, getOrders, nextOrderId, nextPaymentReference } from '../utils/orders.js';
import { buildOrderConfirmationMessage, getCustomerNotificationChannels } from '../utils/orderNotifications.js';
import { PAYMENT_STATUSES, ORDER_STATUSES } from '../utils/paymentProviders.js';
import { enqueueOrderEmail } from '../utils/orderEmailService.js';
import { releaseExpiredCleaningTables } from '../utils/tableAvailability.js';
import { parseMenuVariants } from '../utils/menuVariants.js';
import { applyOrderFulfillmentEffects } from '../utils/orderFulfillment.js';
import { createCustomerOrderTrackingToken, createRoadsideAccessToken, hashRoadsideAccessToken } from '../utils/roadsideAccess.js';
import { getReservationReleaseTime } from '../utils/reservationTiming.js';
import { normalizeTanzanianPhone } from '../../shared/phone.js';
import { closeSettledDineInTab, getOpenDineInTab } from '../utils/dineInTabs.js';
import { calculateOfferDiscount, validateOfferAvailability } from '../utils/orderDiscounts.js';
import { normalizeUserRole } from '../utils/roles.js';

const router = Router();

function formatPromotion(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code || '',
    discountType: row.discount_type,
    discountValue: Number(row.discount_value || 0),
    minimumSubtotal: Number(row.minimum_subtotal || 0),
    eligibleMenuItemIds: JSON.parse(row.eligible_menu_item_ids || '[]'),
    qualifyingQuantity: Number(row.qualifying_quantity || 2),
    rewardQuantity: Number(row.reward_quantity || 1),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxUses: row.max_uses == null ? '' : Number(row.max_uses),
    useCount: Number(row.use_count || 0),
    active: Boolean(row.active),
  };
}

function normalizePromotionInput(body, existing = null) {
  const name = String(body?.name ?? existing?.name ?? '').trim().slice(0, 100);
  const code = String(body?.code ?? existing?.code ?? '').trim().toUpperCase().slice(0, 40) || null;
  const discountType = String(body?.discountType ?? existing?.discount_type ?? 'percentage');
  const discountValue = Number(body?.discountValue ?? existing?.discount_value);
  const minimumSubtotal = Number(body?.minimumSubtotal ?? existing?.minimum_subtotal ?? 0);
  const eligibleMenuItemIds = body?.eligibleMenuItemIds ?? JSON.parse(existing?.eligible_menu_item_ids || '[]');
  const qualifyingQuantity = Number(body?.qualifyingQuantity ?? existing?.qualifying_quantity ?? 2);
  const rewardQuantity = Number(body?.rewardQuantity ?? existing?.reward_quantity ?? 1);
  const startsAt = body?.startsAt ?? existing?.starts_at ?? null;
  const endsAt = body?.endsAt ?? existing?.ends_at ?? null;
  const maxUsesRaw = body?.maxUses ?? existing?.max_uses ?? null;
  const maxUses = maxUsesRaw === '' || maxUsesRaw == null ? null : Number(maxUsesRaw);
  const active = body?.active == null ? (existing ? Number(existing.active) : 1) : (body.active ? 1 : 0);

  if (!name) throw new Error('Offer name is required.');
  if (!['percentage', 'fixed', 'buy_x_get_y'].includes(discountType)) throw new Error('Choose a supported offer type.');
  if (discountType !== 'buy_x_get_y' && (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percentage' && discountValue > 100))) {
    throw new Error('Enter a valid discount value.');
  }
  if (!Number.isFinite(minimumSubtotal) || minimumSubtotal < 0) throw new Error('Minimum subtotal must be non-negative.');
  if (!Array.isArray(eligibleMenuItemIds) || eligibleMenuItemIds.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
    throw new Error('Eligible menu items must be valid item IDs.');
  }
  if (discountType === 'buy_x_get_y' && (!Number.isInteger(qualifyingQuantity) || qualifyingQuantity < 1 || !Number.isInteger(rewardQuantity) || rewardQuantity < 1)) {
    throw new Error('Buy/get quantities must be positive whole numbers.');
  }
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) throw new Error('Maximum uses must be a positive whole number.');
  if (startsAt && Number.isNaN(new Date(startsAt).getTime())) throw new Error('Offer start time is invalid.');
  if (endsAt && Number.isNaN(new Date(endsAt).getTime())) throw new Error('Offer end time is invalid.');
  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) throw new Error('Offer end time must be after its start time.');
  return {
    name, code, discountType, discountValue: discountType === 'buy_x_get_y' ? 0 : discountValue,
    minimumSubtotal, eligibleMenuItemIds: JSON.stringify(eligibleMenuItemIds.map(Number)),
    qualifyingQuantity, rewardQuantity, startsAt, endsAt, maxUses, active,
  };
}

router.get('/offers/available', authMiddleware, (req, res) => {
  const now = new Date().toISOString();
  const rows = db.prepare(`SELECT * FROM promotions WHERE active = 1
    AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)
    AND (max_uses IS NULL OR use_count < max_uses) ORDER BY name`).all(now, now);
  res.json(rows.map(formatPromotion));
});

router.get('/offers', authMiddleware, requireRole('admin', 'manager'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM promotions ORDER BY created_at DESC').all().map(formatPromotion));
});

router.post('/offers', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  try {
    const offer = normalizePromotionInput(req.body);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO promotions
      (id, name, code, discount_type, discount_value, minimum_subtotal, eligible_menu_item_ids,
       qualifying_quantity, reward_quantity, starts_at, ends_at, max_uses, active, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, offer.name, offer.code, offer.discountType, offer.discountValue, offer.minimumSubtotal,
        offer.eligibleMenuItemIds, offer.qualifyingQuantity, offer.rewardQuantity, offer.startsAt,
        offer.endsAt, offer.maxUses, offer.active, req.user.id, now, now);
    res.status(201).json(formatPromotion(db.prepare('SELECT * FROM promotions WHERE id = ?').get(id)));
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to create offer.' });
  }
});

router.patch('/offers/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Offer not found.' });
  try {
    const offer = normalizePromotionInput(req.body, existing);
    const now = new Date().toISOString();
    db.prepare(`UPDATE promotions SET name = ?, code = ?, discount_type = ?, discount_value = ?,
      minimum_subtotal = ?, eligible_menu_item_ids = ?, qualifying_quantity = ?, reward_quantity = ?,
      starts_at = ?, ends_at = ?, max_uses = ?, active = ?, updated_at = ? WHERE id = ?`)
      .run(offer.name, offer.code, offer.discountType, offer.discountValue, offer.minimumSubtotal,
        offer.eligibleMenuItemIds, offer.qualifyingQuantity, offer.rewardQuantity, offer.startsAt,
        offer.endsAt, offer.maxUses, offer.active, now, existing.id);
    res.json(formatPromotion(db.prepare('SELECT * FROM promotions WHERE id = ?').get(existing.id)));
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to update offer.' });
  }
});

function parseMenuIngredients(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseStoredCart(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : { items: [] };
  } catch {
    return { items: [] };
  }
}

function priceOrderItems(items, { allowCustom = false } = {}) {
  const findMenuItem = db.prepare('SELECT id, name, price, variants, prep_time_minutes, ingredients FROM menu_items WHERE id = ? AND active = 1');
  const findModifier = db.prepare('SELECT name, price, type FROM modifiers WHERE name = ?');
  const pricedItems = items.map((item) => {
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Each order item must have a valid menu item and quantity');

    if (item.isCustom === true && allowCustom) {
      const name = String(item.name || '').trim();
      const price = Number(item.price);
      if (!name || !Number.isFinite(price) || price <= 0) throw new Error('Each custom order item must have a name and valid price');
      return {
        menuItemId: null,
        name,
        qty,
        price,
        prepTimeMinutes: 8,
        modifiers: [],
        specialInstructions: item.specialInstructions || null,
        ingredients: [],
      };
    }

    const menuItem = findMenuItem.get(Number(item.menuItemId));
    if (!menuItem) throw new Error('Each order item must have a valid menu item and quantity');
    const variants = parseMenuVariants(menuItem.variants);
    let variant = null;
    if (variants.length) {
      variant = variants.find((option) => option.name === String(item.variantName || '').trim());
      if (!variant) throw new Error(`Choose an available size for ${menuItem.name}`);
    } else if (item.variantName) {
      throw new Error(`The selected size is no longer available for ${menuItem.name}`);
    }
    const modifierNames = Array.isArray(item.modifiers) ? item.modifiers.map((modifier) => typeof modifier === 'string' ? modifier : modifier.name) : [];
    const modifiers = modifierNames.map((name) => findModifier.get(name)).filter(Boolean);
    if (modifiers.length !== modifierNames.length) throw new Error('One or more modifiers are unavailable');
    const price = (variant?.price ?? menuItem.price) + modifiers.reduce((sum, modifier) => sum + (modifier.type === 'add' ? modifier.price : 0), 0);
    return {
      menuItemId: menuItem.id,
      name: variant ? `${menuItem.name} (${variant.name})` : menuItem.name,
      qty,
      price,
      prepTimeMinutes: Number(menuItem.prep_time_minutes ?? 8),
      variantName: variant?.name || null,
      modifiers: modifierNames,
      specialInstructions: item.specialInstructions || null,
      ingredients: parseMenuIngredients(menuItem.ingredients),
    };
  });
  return { items: pricedItems, subtotal: pricedItems.reduce((sum, item) => sum + item.price * item.qty, 0) };
}

function createOrderRecord(
  {
    items,
    orderType,
    tableNumber,
    tableTagId,
    customerName,
    customerPhone,
    customerEmail,
    customerType = 'individual',
    companyName = '',
    customerTin = '',
    billingAddress = '',
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
    paymentMethod = 'lipa_namba',
    scheduledFor,
    fulfillmentMode = 'standard',
    paymentTerms = 'prepaid',
    paymentTiming = 'pay-now',
    orderSource = 'website',
    paymentReference = null,
    discountPercent = 0,
    discountReason = '',
    promotionId = '',
    approveStacking = false,
  },
  staffId = null,
  staffRole = null
) {
  const isDineIn = ['dine-in', 'dine-in-postpay'].includes(String(orderType || ''));
  const normalizedCustomerType = isDineIn ? 'individual' : String(customerType || 'individual').trim().toLowerCase();
  const storedOrderType = isDineIn ? 'dine-in-postpay' : (orderType || 'delivery');
  const normalizedCompanyName = String(companyName || '').trim();
  const normalizedCustomerTin = String(customerTin || '').trim();
  if (!['individual', 'company'].includes(normalizedCustomerType)) throw new Error('Customer type must be individual or company');
  if (normalizedCustomerType === 'company' && (!normalizedCompanyName || !normalizedCustomerTin)) {
    throw new Error('Company name and TIN are required for company invoices');
  }

  const priced = priceOrderItems(items, { allowCustom: Boolean(staffId) });
  const subtotal = priced.subtotal;
  const isManager = ['admin', 'manager'].includes(normalizeUserRole(staffRole));
  const requestedDiscountPercent = Number(discountPercent ?? 0);
  if (!Number.isFinite(requestedDiscountPercent) || requestedDiscountPercent < 0) throw new Error('Discount percentage must be a non-negative number.');
  const hasManualDiscount = requestedDiscountPercent > 0;
  const hasPromotion = Boolean(String(promotionId || '').trim());
  if ((hasManualDiscount || hasPromotion) && !isManager) {
    throw new Error('A manager must approve discounts and offers before checkout.');
  }
  if (hasManualDiscount && requestedDiscountPercent > 100) throw new Error('Discount percentage cannot exceed 100.');
  const normalizedDiscountReason = String(discountReason || '').trim().slice(0, 250);
  if (hasManualDiscount && !normalizedDiscountReason) throw new Error('Enter a reason for the manager-approved discount.');
  if (hasManualDiscount && hasPromotion && approveStacking !== true) {
    throw new Error('Offers and manual discounts cannot be combined unless a manager explicitly approves stacking.');
  }
  let promotion = null;
  let promotionDiscount = 0;
  if (hasPromotion) {
    promotion = db.prepare('SELECT * FROM promotions WHERE id = ?').get(String(promotionId));
    validateOfferAvailability(promotion);
    promotionDiscount = calculateOfferDiscount(promotion, priced.items, subtotal);
  }
  const manualDiscount = hasManualDiscount
    ? Math.min(Math.max(0, subtotal - promotionDiscount), subtotal * requestedDiscountPercent / 100)
    : 0;
  const discountAmount = Math.min(subtotal, Math.round((promotionDiscount + manualDiscount) * 100) / 100);
  const manualDiscountAmount = Math.round(manualDiscount * 100) / 100;
  const offerDiscountAmount = Math.round(promotionDiscount * 100) / 100;
  const discountSource = promotion && hasManualDiscount ? 'promotion_and_manual'
    : promotion ? 'promotion'
      : hasManualDiscount ? 'manual' : null;
  const discountLabel = promotion?.name || (hasManualDiscount ? `${requestedDiscountPercent}% manager discount` : null);
  const taxRateValue = Number(db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get()?.value ?? 8);
  const taxRate = Number.isFinite(taxRateValue) && taxRateValue > 0 ? taxRateValue / 100 : 0;
  const tax = Math.round((subtotal - discountAmount) * taxRate * 100) / 100;
  const total = Math.round((subtotal - discountAmount + tax) * 100) / 100;
  const normalizedFulfillmentMode = String(fulfillmentMode || 'standard');
  if (!['standard', 'roadside_handoff'].includes(normalizedFulfillmentMode)) throw new Error('Choose a valid fulfillment option');
  const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
  if (scheduledFor && (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date())) {
    throw new Error('Choose a future pickup or delivery time');
  }
  const normalizedPaymentTerms = isDineIn ? 'prepaid' : String(paymentTerms || 'prepaid');
  if (!['prepaid', 'invoice'].includes(normalizedPaymentTerms)) throw new Error('Choose valid payment terms');
  let approvedInvoiceTerms = null;
  if (normalizedPaymentTerms === 'invoice') {
    if (normalizedCustomerType !== 'company') throw new Error('Invoice terms are available only to approved company accounts');
    approvedInvoiceTerms = db.prepare(`SELECT t.customer_id FROM company_order_terms t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.status = 'approved' AND lower(trim(c.tin)) = lower(trim(?))
        AND lower(trim(c.company_name)) = lower(trim(?)) AND t.credit_limit >= ?`)
      .get(normalizedCustomerTin, normalizedCompanyName, total);
    if (!approvedInvoiceTerms) throw new Error('This company account is not approved for invoice terms or the order exceeds its credit limit');
    const outstanding = Number(db.prepare(`SELECT COALESCE(SUM(total), 0) AS amount FROM orders
      WHERE customer_id = ? AND payment_terms = 'invoice' AND payment_status NOT IN ('paid', 'completed') AND status != 'cancelled'`)
      .get(approvedInvoiceTerms.customer_id)?.amount || 0);
    const creditLimit = Number(db.prepare('SELECT credit_limit FROM company_order_terms WHERE customer_id = ?').get(approvedInvoiceTerms.customer_id)?.credit_limit || 0);
    if (outstanding + total > creditLimit) throw new Error('This order exceeds the company account’s remaining credit limit');
  }
  if (isDineIn) {
    if (!tableNumber) throw new Error('A table number is required for dine-in orders');
    if (scheduledDate) throw new Error('Dine-in tickets are sent to the kitchen immediately and cannot be scheduled.');
  }

  const id = nextOrderId();
  const paymentRef = (paymentReference?.trim()) || nextPaymentReference(id);
  const now = new Date().toISOString();

  // Determine initial status based on payment and source
  const isStaffCashImmediate = !isDineIn && staffId && (paymentMethod === 'cash' || paymentTiming === 'paid-cash');
  const orderPaymentMethod = isDineIn ? 'tab' : paymentMethod;
  const initialPaymentStatus = isStaffCashImmediate ? PAYMENT_STATUSES.PAID : PAYMENT_STATUSES.PENDING;
  const isInvoiceTerms = Boolean(approvedInvoiceTerms);
  const initialOrderStatus = isDineIn || isStaffCashImmediate || isInvoiceTerms ? ORDER_STATUSES.CONFIRMED : ORDER_STATUSES.PENDING_PAYMENT;
  const paidAt = isStaffCashImmediate ? now : null;
  const reservationStatus = scheduledDate || normalizedFulfillmentMode === 'roadside_handoff'
    ? (isStaffCashImmediate || isInvoiceTerms ? 'confirmed' : 'awaiting_payment')
    : 'none';
  const scheduledReleaseAt = scheduledDate
    ? getReservationReleaseTime(scheduledDate)
    : null;
  const roadsideAccessToken = normalizedFulfillmentMode === 'roadside_handoff' ? createRoadsideAccessToken(id) : null;
  const customerTrackingToken = roadsideAccessToken || createCustomerOrderTrackingToken(id);
  let dineInTabId = null;

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_number, order_type, table_number, customer_id, customer_name, customer_phone, customer_email,
      customer_type, company_name, customer_tin, billing_address,
      delivery_address, delivery_latitude, delivery_longitude, delivery_scheduled_for,
      subtotal, discount_amount, manual_discount_amount, offer_discount_amount, discount_label, discount_reason, discount_source, discount_offer_id, discount_approved_by_user_id,
      tax, total, payment_method, payment_status, order_source, payment_reference, dine_in_tab_id,
      fulfillment_mode, reservation_status, payment_terms, scheduled_release_at,
      status, paid_at, created_at, updated_at, staff_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, qty, price, prep_time_minutes, modifiers, special_instructions, ingredients)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      id, order_id, payment_reference, provider, payment_method, amount, currency,
      received_by_user_id, sender_phone, sender_name, status, paid_at, initiated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'TZS', ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    if (isDineIn) {
      releaseExpiredCleaningTables(db).forEach((table) => broadcast('table:updated', table));
      const table = db.prepare('SELECT * FROM tables WHERE number = ?').get(Number(tableNumber));
      if (!table) throw new Error('Table not found');
      if (!staffId && (!tableTagId || String(table.tag_id || '') !== String(tableTagId))) {
        throw new Error('A valid table QR is required for public dine-in ordering.');
      }
      const openTab = getOpenDineInTab(db, tableNumber);
      if (openTab) {
        if (table.status !== 'occupied') throw new Error('The active table visit is not available for ordering.');
        dineInTabId = openTab.id;
        db.prepare(`UPDATE dine_in_tabs SET
          customer_name = COALESCE(NULLIF(?, ''), customer_name),
          customer_phone = COALESCE(NULLIF(?, ''), customer_phone),
          customer_email = COALESCE(NULLIF(?, ''), customer_email)
          WHERE id = ?`).run(
          String(customerName || '').trim(),
          normalizeTanzanianPhone(customerPhone),
          String(customerEmail || '').trim().toLowerCase(),
          dineInTabId
        );
      } else {
        if (table.status !== 'available') throw new Error('Table is not available');
        dineInTabId = randomUUID();
        db.prepare(`INSERT INTO dine_in_tabs
          (id, table_number, status, customer_name, customer_phone, customer_email, opened_at)
          VALUES (?, ?, 'open', ?, ?, ?, ?)`).run(
          dineInTabId,
          Number(tableNumber),
          String(customerName || '').trim() || null,
          normalizeTanzanianPhone(customerPhone) || null,
          String(customerEmail || '').trim().toLowerCase() || null,
          now
        );
        db.prepare(`UPDATE tables SET status = 'occupied', current_tab_id = ?, cleaning_started_at = NULL WHERE id = ?`)
          .run(dineInTabId, table.id);
      }
    }

    // Customer identity: match by phone, email, or company TIN so each real
    // customer maps to exactly one record (never grouped under a shared "Guest").
    const normalizedEmail = String(customerEmail || '').trim().toLowerCase();
    const normalizedPhone = normalizeTanzanianPhone(customerPhone);
    const normalizedName = String(customerName || '').trim().toLowerCase();
    const hasIdentity = Boolean(normalizedPhone || normalizedEmail || (normalizedCustomerType === 'company' && normalizedCustomerTin) || customerName?.trim());
    let resolvedCustomerId = null;
    if (hasIdentity) {
      const contactMatches = db.prepare(
        "SELECT * FROM customers WHERE (? <> '' AND phone = ?) OR (? <> '' AND lower(email) = ?) OR (? <> '' AND tin = ?) ORDER BY id DESC"
      ).all(normalizedPhone, normalizedPhone, normalizedEmail, normalizedEmail, normalizedCustomerTin, normalizedCustomerTin);
      const nameMatches = db.prepare("SELECT * FROM customers WHERE ? <> '' AND lower(name) = ? ORDER BY id DESC").all(normalizedName, normalizedName);
      const existingCustomer = contactMatches[0] || (nameMatches.length === 1 ? nameMatches[0] : null);
      if (existingCustomer) {
        resolvedCustomerId = existingCustomer.id;
        db.prepare(
          'UPDATE customers SET name = ?, phone = COALESCE(NULLIF(?, \'\'), phone), email = COALESCE(NULLIF(?, \'\'), email), customer_type = ?, company_name = ?, tin = COALESCE(NULLIF(?, \'\'), tin), billing_address = ? WHERE id = ?'
        ).run(
          (customerName || existingCustomer.name || '').trim(),
          normalizedPhone,
          normalizedEmail,
          normalizedCustomerType,
          normalizedCustomerType === 'company' ? normalizedCompanyName : (existingCustomer.company_name || ''),
          normalizedCustomerTin,
          String(billingAddress || '').trim(),
          existingCustomer.id
        );
      } else {
        const result = db.prepare(
          'INSERT INTO customers (name, phone, email, favorite_items, lifetime_value, last_visit, visits, customer_segment, preferred_channel, customer_type, company_name, tin, billing_address) VALUES (?, ?, ?, \'[]\', 0, NULL, 0, ?, ?, ?, ?, ?, ?)'
        ).run(
          (customerName || '').trim(),
          normalizedPhone,
          normalizedEmail,
          'first_order',
          orderSource || 'pos',
          normalizedCustomerType,
          normalizedCustomerType === 'company' ? normalizedCompanyName : '',
          normalizedCustomerTin,
          String(billingAddress || '').trim()
        );
        resolvedCustomerId = result.lastInsertRowid;
      }
    }

    insertOrder.run(
      id,
      id,
      storedOrderType,
      tableNumber || null,
      resolvedCustomerId,
      customerName || null,
      normalizedPhone || null,
      customerEmail || null,
      normalizedCustomerType,
      normalizedCustomerType === 'company' ? normalizedCompanyName : null,
      normalizedCustomerTin || null,
      String(billingAddress || '').trim() || null,
      deliveryAddress || null,
      deliveryLatitude || null,
      deliveryLongitude || null,
      scheduledFor || null,
      subtotal,
      discountAmount,
      manualDiscountAmount,
      offerDiscountAmount,
      discountLabel,
      normalizedDiscountReason || null,
      discountSource,
      promotion?.id || null,
      (hasManualDiscount || hasPromotion) ? staffId : null,
      tax,
      total,
      orderPaymentMethod,
      initialPaymentStatus,
      orderSource,
      paymentRef,
      dineInTabId,
      normalizedFulfillmentMode,
      reservationStatus,
      normalizedPaymentTerms,
      scheduledReleaseAt,
      initialOrderStatus,
      paidAt,
      now,
      now,
      staffId
    );

    for (const item of priced.items) {
      insertItem.run(
        id,
        item.menuItemId,
        item.name,
        item.qty,
        item.price,
        item.prepTimeMinutes || 8,
        JSON.stringify(item.modifiers),
        item.specialInstructions,
        JSON.stringify(item.ingredients || [])
      );
    }

    db.prepare(`INSERT INTO customer_order_tracking_links (order_id, access_token_hash, created_at)
      VALUES (?, ?, ?)`).run(id, hashRoadsideAccessToken(customerTrackingToken), now);

    if (roadsideAccessToken) {
      db.prepare(`INSERT INTO roadside_trips (order_id, access_token_hash, status, created_at, updated_at)
        VALUES (?, ?, 'awaiting_customer', ?, ?)`)
        .run(id, hashRoadsideAccessToken(roadsideAccessToken), now, now);
    }

    if (promotion) {
      const usage = db.prepare(`UPDATE promotions SET use_count = use_count + 1, updated_at = ?
        WHERE id = ? AND active = 1 AND (max_uses IS NULL OR use_count < max_uses)`)
        .run(now, promotion.id);
      if (!usage.changes) throw new Error('This offer has reached its usage limit.');
    }

    const autoPrint = db.prepare("SELECT value FROM settings WHERE key = 'printer_auto_print'").get()?.value !== 'false';
    if (staffId && autoPrint && (initialPaymentStatus === PAYMENT_STATUSES.PAID || isDineIn) && !scheduledDate) {
      const branchCode = db.prepare("SELECT value FROM settings WHERE key = 'branch_code'").get()?.value || 'MAIN';
      db.prepare('INSERT OR IGNORE INTO printer_jobs (order_id, branch_code, created_at) VALUES (?, ?, ?)')
        .run(id, branchCode, now);
    }

    // Create payment tracking record
    if (!isDineIn) {
      insertPayment.run(
        `PAY-${Date.now()}-${id}`,
        id,
        paymentRef,
        orderPaymentMethod || 'lipa_namba',
        orderPaymentMethod || 'lipa_namba',
        total,
        initialPaymentStatus === PAYMENT_STATUSES.PAID ? staffId : null,
        normalizedPhone || null,
        customerName || null,
        initialPaymentStatus,
        paidAt,
        now,
        now,
        now
      );
    }

    insertEvent.run(
      id,
      'created',
      initialOrderStatus,
      staffId,
      now,
      JSON.stringify({
        source: orderSource,
        paymentReference: paymentRef,
        paymentStatus: initialPaymentStatus,
        discountAmount,
        discountSource,
        discountReason: normalizedDiscountReason || null,
        promotionId: promotion?.id || null,
        promotionName: promotion?.name || null,
        stackingApproved: hasManualDiscount && hasPromotion && approveStacking === true,
      })
    );

    if (isDineIn) {
      db.prepare(`UPDATE tables SET status = 'occupied', current_order_id = ?, current_tab_id = ?, cleaning_started_at = NULL WHERE number = ?`)
        .run(id, dineInTabId, Number(tableNumber));
    }
  });

  tx();
  if (initialPaymentStatus === PAYMENT_STATUSES.PAID) applyOrderFulfillmentEffects(id);
  const order = getOrderById(id);
  if (order?.customerEmail) {
    try {
      const emailType = order.paymentTerms === 'invoice'
        ? 'company_invoice'
        : order.paymentStatus === PAYMENT_STATUSES.PAID ? 'paid_invoice' : 'order_received';
      enqueueOrderEmail(order.id, emailType);
    } catch (error) {
      console.error(`Could not queue customer email for order ${order.id}:`, error.message);
    }
    // Automatically add every order email to the email-marketing list.
    // New addresses enter as 'pending' (double opt-in); existing suppressed/unsubscribed
    // addresses are left untouched so we never re-add someone who opted out.
    try {
      const normalizedEmail = String(order.customerEmail).trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        const existing = db.prepare('SELECT id, consent_status, active FROM email_subscribers WHERE lower(email) = ?').get(normalizedEmail);
        const suppressed = db.prepare('SELECT email FROM email_suppressions WHERE email = ?').get(normalizedEmail);
        if (!existing && !suppressed) {
          const firstName = String(order.customer_name || order.customerName || '').trim().split(/\s+/)[0] || '';
          const lastName = String(order.customer_name || order.customerName || '').trim().split(/\s+/).slice(1).join(' ');
          db.prepare(`INSERT INTO email_subscribers (email, first_name, last_name, segment, source, preferred_channel, active, verified,
            consent_status, consent_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'order', 'email', 0, 0, 'pending', 'order_checkout', ?, ?)`)
            .run(normalizedEmail, firstName, lastName, 'regular', now, now);
        }
      }
    } catch (error) {
      console.error(`Could not auto-enroll order email ${order.customerEmail}:`, error.message);
    }
  }

  broadcast('order:created', order);
  if (initialOrderStatus === ORDER_STATUSES.CONFIRMED) {
    broadcast('order:confirmed', order);
  }
  const orderNotification = { type: 'info', title: `New order ${order.id}`, message: `${order.customer || 'A customer'} placed a new ${order.type} order.`, audienceRoles: ['admin', 'manager', 'kitchen', 'foh'] };
  const notificationCreatedAt = new Date().toISOString();
  for (const role of ['manager', 'kitchen', 'foh']) {
    db.prepare('INSERT INTO notifications (type, title, message, read, created_at, audience_role) VALUES (?, ?, ?, 0, ?, ?)').run(orderNotification.type, orderNotification.title, orderNotification.message, notificationCreatedAt, role);
  }
  broadcast('notification:created', orderNotification);

  if (order?.customer_phone || order?.customer_email) {
    const customerRow = db.prepare('SELECT * FROM customers WHERE phone = ? OR email = ? ORDER BY id DESC LIMIT 1').get(order.customer_phone || '', order.customer_email || '');
    const preferredChannels = getCustomerNotificationChannels(customerRow || {
      email: order.customer_email,
      phone: order.customer_phone,
      preferred_channel: order.order_source || 'pos',
      channel: order.order_source || 'pos',
    });

    const announcementChannels = [
      preferredChannels.whatsapp ? 'WhatsApp' : null,
      preferredChannels.sms ? 'SMS' : null,
      preferredChannels.email ? 'Email' : null,
    ].filter(Boolean);

    const notifyChannel = announcementChannels[0] || 'WhatsApp';
    const message = buildOrderConfirmationMessage(order.id, notifyChannel, order.customer_name || 'Customer');

    db.prepare('INSERT INTO notifications (type, title, message, read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run('success', `Order confirmed (${notifyChannel})`, message, new Date().toISOString());
    broadcast('notification:created', { type: 'success', title: `Order confirmed (${notifyChannel})` });
  }

  return {
    ...order,
    customerTrackingToken,
    ...(roadsideAccessToken ? { roadsideAccessToken } : {}),
  };
}

/**
 * Public Order Placement (Customers from website / table QR)
 * POST /api/orders/public
 */
router.post('/public', (req, res) => {
  const {
    items,
    customerName,
    customerPhone,
    customerEmail,
    customerType,
    companyName,
    customerTin,
    billingAddress,
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
    orderType,
    tableNumber,
    tableTagId,
    scheduledFor,
    fulfillmentMode,
    paymentTerms,
    orderSource,
    paymentReference,
    paymentMethod = 'lipa_namba',
  } = req.body;

  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });
  if (orderType === 'dine-in' && !tableNumber) return res.status(400).json({ error: 'A table number is required' });
  if (orderType !== 'dine-in' && fulfillmentMode !== 'roadside_handoff' && !deliveryAddress?.trim()) return res.status(400).json({ error: 'Delivery address is required' });

  try {
    const order = createOrderRecord({
      items,
      orderType: orderType || 'delivery',
      tableNumber,
      tableTagId,
      customerName,
      customerPhone,
      customerEmail,
      customerType,
      companyName,
      customerTin,
      billingAddress,
      deliveryAddress,
      deliveryLatitude,
      deliveryLongitude,
      scheduledFor,
      fulfillmentMode,
      paymentTerms,
      paymentTiming: 'pay-now',
      orderSource: orderSource || (tableNumber ? 'nfc' : 'website'),
      paymentReference,
      paymentMethod,
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Public order placement failed:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Public Order Status Lookup (Customers tracking their order by ID or Ref)
 * GET /api/orders/public/:idOrRef
 */
router.get('/public/:idOrRef', (req, res) => {
  const order = getOrderById(req.params.idOrRef);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const suppliedPhone = normalizeTanzanianPhone(req.query.phone).replace(/\D/g, '');
  const orderPhone = normalizeTanzanianPhone(order.customerPhone).replace(/\D/g, '');
  if (!suppliedPhone || suppliedPhone !== orderPhone) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

router.get('/reservations', authMiddleware, requireRole('admin', 'manager', 'foh'), (_req, res) => {
  res.json(getOrders({}, { includeInvoiceEmailStatus: true }).filter((order) => order.reservationStatus !== 'none'));
});

router.post('/:id/refunds', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(req.params.id, req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const paymentId = String(req.body?.paymentId || '');
  const payment = db.prepare(`SELECT id, amount, status FROM payments WHERE id = ? AND order_id = ?`).get(paymentId, order.id);
  if (!payment || !['paid', 'completed'].includes(payment.status)) {
    return res.status(400).json({ error: 'Choose a settled payment from this order to refund.' });
  }
  const amount = Number(req.body?.amount);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const payoutMethod = String(req.body?.payoutMethod || '').trim().toLowerCase();
  const payoutReference = String(req.body?.payoutReference || '').trim().slice(0, 120);
  const managerApproved = ['admin', 'manager'].includes(normalizeUserRole(req.user.role));
  if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ error: 'Refund amount must be a positive whole number of TZS.' });
  if (!reason) return res.status(400).json({ error: 'A refund reason is required.' });
  if (amount > 10000 && !managerApproved) {
    const now = new Date().toISOString();
    const refundId = randomUUID();
    try {
      const createRequest = db.transaction(() => {
        const reserved = Number(db.prepare(`SELECT COALESCE(SUM(amount), 0) AS amount FROM refunds
          WHERE payment_id = ? AND status IN ('pending', 'pending_approval', 'processed')`).get(paymentId).amount);
        if (amount > Number(payment.amount) - reserved) throw new Error('Refund exceeds the remaining amount paid for this payment.');
        db.prepare(`INSERT INTO refunds
          (id, payment_id, order_id, amount, reason, refund_reference, status, requested_at, requested_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)`)
          .run(refundId, paymentId, order.id, amount, reason, `WR-REF-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`, now, req.user.id);
        db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
          VALUES (?, 'refund_requested', 'pending_approval', ?, ?, ?)`)
          .run(order.id, req.user.id, now, JSON.stringify({ refundId, paymentId, amount, reason }));
        db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
          VALUES ('warning', ?, ?, 0, ?, 'manager')`)
          .run(`Refund approval required · ${order.order_number || order.id}`, `${amount} TZS refund requested: ${reason}`, now);
      });
      createRequest();
    } catch (error) {
      return res.status(409).json({ error: error.message || 'Refund request could not be recorded.' });
    }
    broadcast('order:updated', getOrderById(order.id));
    return res.status(202).json(getOrderById(order.id));
  }

  if (!['cash', 'lipa_namba', 'card', 'bank_transfer', 'other'].includes(payoutMethod)) {
    return res.status(400).json({ error: 'Choose how the refund was or will be paid.' });
  }
  if (['lipa_namba', 'card', 'bank_transfer'].includes(payoutMethod) && !payoutReference) {
    return res.status(400).json({ error: 'Enter the refund transaction/reference for this payout method.' });
  }
  const now = new Date().toISOString();
  const refundId = randomUUID();
  try {
    const processRefund = db.transaction(() => {
      const reserved = Number(db.prepare(`SELECT COALESCE(SUM(amount), 0) AS amount FROM refunds
        WHERE payment_id = ? AND status IN ('pending', 'pending_approval', 'processed')`).get(paymentId).amount);
      if (amount > Number(payment.amount) - reserved) throw new Error('Refund exceeds the remaining amount paid for this payment.');
      db.prepare(`INSERT INTO refunds
        (id, payment_id, order_id, amount, reason, refund_reference, status, requested_at, processed_at,
         requested_by_user_id, approved_by_user_id, processed_by_user_id, payout_method, payout_reference)
        VALUES (?, ?, ?, ?, ?, ?, 'processed', ?, ?, ?, ?, ?, ?, ?)`)
        .run(refundId, paymentId, order.id, amount, reason,
          `WR-REF-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`, now, now,
          req.user.id, managerApproved ? req.user.id : null, req.user.id, payoutMethod, payoutReference || null);
      db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
        VALUES (?, 'refund_processed', 'processed', ?, ?, ?)`)
        .run(order.id, req.user.id, now, JSON.stringify({ refundId, paymentId, amount, reason, payoutMethod, payoutReference }));
    });
    processRefund();
  } catch (error) {
    return res.status(409).json({ error: error.message || 'Refund could not be recorded.' });
  }
  broadcast('order:updated', getOrderById(order.id));
  res.json(getOrderById(order.id));
});

router.patch('/:id/refunds/:refundId', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE id = ? OR order_number = ?').get(req.params.id, req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const decision = String(req.body?.decision || '');
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Choose approve or reject.' });
  const now = new Date().toISOString();
  let eventType;
  let eventStatus;
  let metadata;
  let update;
  let payoutMethod;
  let payoutReference;
  let approvalNotes;
  if (decision === 'reject') {
    approvalNotes = String(req.body?.approvalNotes || '').trim().slice(0, 500);
    if (!approvalNotes) return res.status(400).json({ error: 'Enter a reason for rejecting the refund.' });
    update = db.prepare(`UPDATE refunds SET status = 'rejected', approved_by_user_id = ?, processed_at = ?, approval_notes = ?
      WHERE id = ? AND order_id = ? AND status = 'pending_approval'`);
    eventType = 'refund_rejected';
    eventStatus = 'rejected';
    metadata = { refundId: req.params.refundId, reason: approvalNotes };
  } else {
    payoutMethod = String(req.body?.payoutMethod || '').trim().toLowerCase();
    payoutReference = String(req.body?.payoutReference || '').trim().slice(0, 120);
    approvalNotes = String(req.body?.approvalNotes || '').trim().slice(0, 500);
    if (!['cash', 'lipa_namba', 'card', 'bank_transfer', 'other'].includes(payoutMethod)) {
      return res.status(400).json({ error: 'Choose the refund payout method.' });
    }
    if (['lipa_namba', 'card', 'bank_transfer'].includes(payoutMethod) && !payoutReference) {
      return res.status(400).json({ error: 'Enter the refund transaction/reference for this payout method.' });
    }
    update = db.prepare(`UPDATE refunds SET status = 'processed', approved_by_user_id = ?, processed_by_user_id = ?,
      processed_at = ?, payout_method = ?, payout_reference = ?, approval_notes = ?
      WHERE id = ? AND order_id = ? AND status = 'pending_approval'`);
    eventType = 'refund_processed';
    eventStatus = 'processed';
    metadata = {
      refundId: req.params.refundId,
      payoutMethod,
      payoutReference,
      approvalNotes,
    };
  }
  try {
    const reviewRefund = db.transaction(() => {
      const refund = db.prepare(`SELECT amount FROM refunds WHERE id = ? AND order_id = ? AND status = 'pending_approval'`)
        .get(req.params.refundId, order.id);
      if (!refund) {
        const error = new Error('Pending refund request not found.');
        error.status = 404;
        throw error;
      }
      const result = decision === 'reject'
        ? update.run(req.user.id, now, metadata.reason, req.params.refundId, order.id)
        : update.run(req.user.id, req.user.id, now, payoutMethod,
          payoutReference || null, approvalNotes, req.params.refundId, order.id);
      if (result.changes !== 1) throw new Error('Refund request was already reviewed.');
      if (decision === 'approve') metadata.amount = refund.amount;
      db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(order.id, eventType, eventStatus, req.user.id, now, JSON.stringify(metadata));
    });
    reviewRefund();
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Refund review failed:', error);
    return res.status(409).json({ error: error.message || 'Refund request could not be reviewed.' });
  }
  broadcast('order:updated', getOrderById(order.id));
  res.json(getOrderById(order.id));
});

router.get('/company-terms', authMiddleware, requireRole('admin', 'manager'), (_req, res) => {
  const rows = db.prepare(`SELECT c.id AS customer_id, c.name, c.phone, c.email, c.company_name, c.tin,
      COALESCE(t.status, 'pending') AS status, COALESCE(t.credit_limit, 0) AS credit_limit,
      t.approved_at, u.name AS approved_by_name
    FROM customers c LEFT JOIN company_order_terms t ON t.customer_id = c.id
    LEFT JOIN users u ON u.id = t.approved_by
    WHERE c.customer_type = 'company' ORDER BY c.company_name, c.name`).all();
  res.json(rows.map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    companyName: row.company_name,
    tin: row.tin,
    status: row.status,
    creditLimit: Number(row.credit_limit),
    approvedAt: row.approved_at,
    approvedBy: row.approved_by_name,
  })));
});

router.patch('/company-terms/:customerId', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const customerId = Number(req.params.customerId);
  const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND customer_type = 'company'").get(customerId);
  if (!customer) return res.status(404).json({ error: 'Company customer not found.' });
  const status = String(req.body?.status || '');
  const creditLimit = Number(req.body?.creditLimit);
  if (!['approved', 'revoked', 'pending'].includes(status)) return res.status(400).json({ error: 'Choose approved, revoked, or pending.' });
  if (status === 'approved' && (!Number.isFinite(creditLimit) || creditLimit <= 0)) return res.status(400).json({ error: 'Approved invoice terms require a positive credit limit.' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO company_order_terms (customer_id, status, credit_limit, approved_by, approved_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET status = excluded.status, credit_limit = excluded.credit_limit,
      approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = excluded.updated_at`)
    .run(customerId, status, status === 'approved' ? creditLimit : 0,
      status === 'approved' ? req.user.id : null, status === 'approved' ? now : null, now, now);
  res.json({ ok: true, customerId, status, creditLimit: status === 'approved' ? creditLimit : 0 });
});

/**
 * Authenticated Orders Listing (Staff POS / Admin)
 * GET /api/orders
 */
router.get('/', authMiddleware, (req, res) => {
  const { status, paymentStatus } = req.query;
  res.json(getOrders({ status, paymentStatus }, { includeInvoiceEmailStatus: true }));
});

router.get('/held', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const bills = db.prepare(`SELECT id, label, cart_json, item_count, total, created_at
    FROM held_pos_bills WHERE owner_user_id = ? ORDER BY created_at DESC`).all(req.user.id);
  res.json(bills.map((bill) => ({
    id: bill.id,
    label: bill.label,
    cart: parseStoredCart(bill.cart_json),
    itemCount: bill.item_count,
    total: bill.total,
    heldAt: bill.created_at,
  })));
});

router.post('/held', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const cart = req.body?.cart;
  if (!cart || typeof cart !== 'object' || !Array.isArray(cart.items) || !cart.items.length) {
    return res.status(400).json({ error: 'A non-empty held cart is required.' });
  }
  const serializedCart = JSON.stringify(cart);
  if (serializedCart.length > 500000) return res.status(413).json({ error: 'This held bill is too large to save.' });
  const id = `held-${randomUUID()}`;
  const now = new Date().toISOString();
  const itemCount = cart.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? item.qty ?? 0)), 0);
  const calculatedTotal = cart.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity ?? item.qty ?? 0), 0);
  const total = Number.isFinite(Number(req.body?.total)) ? Number(req.body.total) : calculatedTotal;
  const label = String(req.body?.label || '').trim().slice(0, 120) || `Held bill ${new Date(now).toLocaleTimeString()}`;
  db.prepare(`INSERT INTO held_pos_bills (id, owner_user_id, label, cart_json, item_count, total, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, label, serializedCart, itemCount, total, now, now);
  res.status(201).json({ id, label, cart, itemCount, total, heldAt: now });
});

router.delete('/held/:id', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const result = db.prepare('DELETE FROM held_pos_bills WHERE id = ? AND owner_user_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Held bill not found.' });
  res.json({ ok: true });
});

function getTrackedCustomerOrder(orderId, token) {
  const id = String(orderId || '');
  const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(id, id);
  const link = order && db.prepare('SELECT access_token_hash FROM customer_order_tracking_links WHERE order_id = ?').get(order.id);
  if (!order || !link || !token) return null;
  const expected = Buffer.from(link.access_token_hash, 'hex');
  const actual = Buffer.from(hashRoadsideAccessToken(token), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return order;
}

router.get('/tracking/:id', (req, res) => {
  const order = getTrackedCustomerOrder(req.params.id, String(req.get('x-order-tracking-token') || ''));
  if (!order) return res.status(404).json({ error: 'Order tracking link is unavailable.' });
  const trip = db.prepare('SELECT status FROM roadside_trips WHERE order_id = ?').get(order.id);
  res.json({
    id: order.id,
    orderNumber: order.order_number || order.id,
    type: order.order_type === 'dine-in-postpay' ? 'dine-in' : order.order_type,
    customerName: order.customer_name || '',
    customerPhone: normalizeTanzanianPhone(order.customer_phone),
    customerEmail: order.customer_email || '',
    status: order.status,
    paymentStatus: order.payment_status,
    paymentTerms: order.payment_terms,
    fulfillmentMode: order.fulfillment_mode,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    scheduledFor: order.delivery_scheduled_for,
    scheduledReleaseAt: order.scheduled_release_at,
    kitchenReleasedAt: order.kitchen_released_at,
    reservationStatus: order.reservation_status,
    roadsideStatus: trip?.status || null,
    items: db.prepare('SELECT name, qty, prep_time_minutes AS prepTimeMinutes FROM order_items WHERE order_id = ?').all(order.id),
  });
});

router.patch('/tracking/:id', (req, res) => {
  const order = getTrackedCustomerOrder(req.params.id, String(req.get('x-order-tracking-token') || ''));
  if (!order) return res.status(404).json({ error: 'Order tracking link is unavailable.' });

  const customerName = String(req.body?.customerName ?? order.customer_name ?? '').trim();
  const customerPhone = normalizeTanzanianPhone(req.body?.customerPhone ?? order.customer_phone ?? '');
  const customerEmail = String(req.body?.customerEmail ?? order.customer_email ?? '').trim().toLowerCase();
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!customerPhone && !customerEmail) return res.status(400).json({ error: 'Add a phone number or email address.' });

  const saveContact = db.transaction(() => {
    db.prepare('UPDATE orders SET customer_name = ?, customer_phone = ?, customer_email = ?, updated_at = ? WHERE id = ?')
      .run(customerName, customerPhone || null, customerEmail || null, new Date().toISOString(), order.id);
    if (order.customer_id) {
      db.prepare('UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?')
        .run(customerName, customerPhone || null, customerEmail || null, order.customer_id);
    }
  });
  saveContact();
  const updatedOrder = getOrderById(order.id, { includeInvoiceEmailStatus: true });
  broadcast('order:updated', updatedOrder);
  res.json({ customerName, customerPhone, customerEmail });
});

router.post('/:id/share-link', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const order = db.prepare('SELECT id, fulfillment_mode FROM orders WHERE id = ? OR order_number = ?').get(req.params.id, req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const isRoadsideOrder = order.fulfillment_mode === 'roadside_handoff';
  const token = isRoadsideOrder ? createRoadsideAccessToken(order.id) : createCustomerOrderTrackingToken(order.id);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO customer_order_tracking_links (order_id, access_token_hash, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET access_token_hash = excluded.access_token_hash`)
    .run(order.id, hashRoadsideAccessToken(token), now);

  const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://wrapandrolltz.com').replace(/\/+$/, '');
  const trackingPath = isRoadsideOrder ? 'roadside-track' : 'order-progress';
  res.json({ url: `${baseUrl}/${trackingPath}/${encodeURIComponent(order.id)}#${encodeURIComponent(token)}` });
});

/**
 * Authenticated Single Order Lookup
 * GET /api/orders/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id, { includeInvoiceEmailStatus: true });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/**
 * Authenticated POS Order Creation (Staff Counter)
 * POST /api/orders
 */
router.post('/', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Order must have items' });

  try {
    const order = createOrderRecord(req.body, req.user.id, req.user.role);
    res.status(201).json(order);
  } catch (error) {
    console.error('POS order placement failed:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Update Kitchen / Fulfillment Order Status
 * PATCH /api/orders/:id/status
 */
router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  // Guard: Kitchen cannot accept or prepare an unpaid order
  if (
    ['preparing', 'ready'].includes(status) &&
    existing.payment_status !== PAYMENT_STATUSES.PAID &&
    existing.order_type !== 'dine-in-postpay' &&
    !(existing.payment_terms === 'invoice' && ['confirmed', 'released'].includes(existing.reservation_status))
  ) {
    return res.status(409).json({
      error: 'Cannot prepare order: Payment must be verified (PAID) before kitchen starts cooking.',
    });
  }

  if (status === 'preparing' && existing.scheduled_release_at && new Date(existing.scheduled_release_at) > new Date()) {
    return res.status(409).json({ error: 'This scheduled order is not due for kitchen preparation yet.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
  if (status === 'preparing') applyOrderFulfillmentEffects(req.params.id, { allowInvoiceTerms: true });
  db.prepare('INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, 'status_changed', status, req.user.id, now, JSON.stringify({ previousStatus: existing.status }));

  if (status === 'completed' && existing.status !== 'completed' && existing.table_number) {
    if (existing.dine_in_tab_id) {
      if (closeSettledDineInTab(db, existing.dine_in_tab_id, req.user?.name || 'Staff', now)) {
        const table = db.prepare('SELECT * FROM tables WHERE number = ?').get(existing.table_number);
        broadcast('table:updated', table);
      }
    } else {
      db.prepare('UPDATE tables SET status = ?, current_order_id = NULL, cleaning_started_at = ? WHERE number = ? AND current_order_id = ?')
        .run('cleaning', now, existing.table_number, existing.id);
    }
  }

  const order = getOrderById(req.params.id);
  broadcast('order:updated', order);
  res.json(order);
});

router.patch('/:id/reservation', authMiddleware, requireRole('admin', 'manager', 'foh'), (req, res) => {
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing || existing.reservation_status === 'none') return res.status(404).json({ error: 'Reservation not found.' });
  const action = String(req.body?.action || '');
  const now = new Date().toISOString();
  let nextStatus = existing.reservation_status;
  let scheduledFor = existing.delivery_scheduled_for;
  if (action === 'confirm') {
    if (existing.payment_status !== PAYMENT_STATUSES.PAID && !(existing.payment_terms === 'invoice' && existing.reservation_status === 'confirmed')) {
      return res.status(409).json({ error: 'Verify payment before confirming this reservation.' });
    }
    nextStatus = 'confirmed';
  } else if (action === 'cancel') {
    nextStatus = 'cancelled';
  } else if (action === 'reschedule') {
    const date = new Date(req.body?.scheduledFor);
    if (!req.body?.scheduledFor || Number.isNaN(date.getTime()) || date <= new Date()) {
      return res.status(400).json({ error: 'Choose a future time.' });
    }
    scheduledFor = date.toISOString();
  } else {
    return res.status(400).json({ error: 'Choose confirm, cancel, or reschedule.' });
  }
  let releaseAt = existing.scheduled_release_at;
  if (action === 'reschedule') {
    releaseAt = getReservationReleaseTime(scheduledFor);
  }
  db.prepare(`UPDATE orders SET reservation_status = ?, delivery_scheduled_for = ?, scheduled_release_at = ?,
    status = CASE WHEN ? = 'cancel' THEN 'cancelled' ELSE status END, updated_at = ? WHERE id = ?`)
    .run(nextStatus, scheduledFor, releaseAt, action, now, existing.id);
  if (action === 'cancel') {
    db.prepare(`UPDATE roadside_trips SET status = 'cancelled', ended_at = COALESCE(ended_at, ?), updated_at = ?
      WHERE order_id = ? AND status NOT IN ('completed', 'cancelled')`).run(now, now, existing.id);
  }
  db.prepare(`INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata)
    VALUES (?, 'reservation_changed', ?, ?, ?, ?)`)
    .run(existing.id, nextStatus, req.user.id, now, JSON.stringify({
      action,
      scheduledFor,
      refundFollowUpRequired: action === 'cancel' && ['paid', 'completed'].includes(existing.payment_status),
    }));
  if (action === 'cancel' && ['paid', 'completed'].includes(existing.payment_status)) {
    db.prepare(`INSERT INTO notifications (type, title, message, read, created_at, audience_role)
      VALUES ('warning', ?, ?, 0, ?, 'manager')`)
      .run(`Refund follow-up: ${existing.order_number || existing.id}`, `Paid order ${existing.order_number || existing.id} was cancelled. Arrange and record any agreed refund separately.`, now);
  }
  const order = getOrderById(existing.id, { includeInvoiceEmailStatus: true });
  if (order.customerEmail) {
    try {
      enqueueOrderEmail(order.id, `reservation_update:${Date.now()}`);
    } catch (error) {
      console.error(`Could not queue reservation update email for ${order.id}:`, error.message);
    }
  }
  if (action === 'cancel') broadcast('roadside:updated', { orderId: existing.id, status: 'cancelled' });
  broadcast('order:updated', order);
  res.json(order);
});

/**
 * Update Payment Status
 * PATCH /api/orders/:id/payment-status
 */
router.patch('/:id/customer', authMiddleware, (req, res) => {
  const { customerName, customerPhone, customerEmail, customerType, companyName, customerTin, billingAddress } = req.body || {};
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const payload = {
    customerName: String(customerName ?? existing.customer_name ?? '').trim(),
    customerPhone: normalizeTanzanianPhone(customerPhone ?? existing.customer_phone ?? ''),
    customerEmail: String(customerEmail ?? existing.customer_email ?? '').trim().toLowerCase(),
    customerType: ['individual', 'company'].includes(String(customerType || existing.customer_type || 'individual'))
      ? String(customerType || existing.customer_type || 'individual')
      : 'individual',
    companyName: String(companyName ?? existing.company_name ?? '').trim(),
    customerTin: String(customerTin ?? existing.customer_tin ?? '').trim(),
    billingAddress: String(billingAddress ?? existing.billing_address ?? '').trim(),
  };

  if (payload.customerType === 'company' && (!payload.companyName || !payload.customerTin)) {
    return res.status(400).json({ error: 'Company name and TIN are required for company invoices.' });
  }

  const now = new Date().toISOString();
  const existingCustomerPhone = String(existing.customer_phone || '').trim();
  const existingCustomerEmail = String(existing.customer_email || '').trim().toLowerCase();
  const existingCustomerName = String(existing.customer_name || '').trim().toLowerCase();
  const customerMatch = existing.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.customer_id)
    : (existingCustomerPhone || existingCustomerEmail || existingCustomerName)
      ? db.prepare(`SELECT * FROM customers
          WHERE (? <> '' AND phone = ?)
            OR (? <> '' AND lower(email) = ?)
            OR (? <> '' AND lower(name) = ?)
          ORDER BY id DESC LIMIT 1`)
        .get(existingCustomerPhone, existingCustomerPhone, existingCustomerEmail, existingCustomerEmail, existingCustomerName, existingCustomerName)
      : null;
  const customerNameProvided = Object.hasOwn(req.body || {}, 'customerName');

  const saveCustomerDetails = db.transaction(() => {
    db.prepare(`UPDATE orders SET customer_name = ?, customer_phone = ?, customer_email = ?, customer_type = ?, company_name = ?, customer_tin = ?, billing_address = ?, updated_at = ? WHERE id = ?`)
      .run(payload.customerName || null, payload.customerPhone || null, payload.customerEmail || null, payload.customerType, payload.companyName || null, payload.customerTin || null, payload.billingAddress || null, now, req.params.id);

  if (customerMatch) {
    db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, customer_type = ?, company_name = ?, tin = ?, billing_address = ? WHERE id = ?')
      .run(customerNameProvided ? payload.customerName : (customerMatch.name || payload.customerName), payload.customerPhone, payload.customerEmail, payload.customerType, payload.companyName, payload.customerTin, payload.billingAddress, customerMatch.id);
  }
  });
  saveCustomerDetails();

  const order = getOrderById(req.params.id, { includeInvoiceEmailStatus: true });
  broadcast('order:updated', order);
  res.json(order);
});

router.patch('/:id/payment-status', authMiddleware, (req, res) => {
  const { paymentStatus, notes } = req.body || {};
  const validStatuses = Object.values(PAYMENT_STATUSES);

  if (!validStatuses.includes(paymentStatus)) {
    return res.status(400).json({ error: `Invalid payment status. Allowed: ${validStatuses.join(', ')}` });
  }

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  if (existing.dine_in_tab_id) {
    return res.status(409).json({ error: 'Dine-in tab payments must be recorded against the table balance.' });
  }

  const now = new Date().toISOString();
  const staffName = req.user?.name || 'Staff';

  const newOrderStatus = paymentStatus === PAYMENT_STATUSES.PAID ? ORDER_STATUSES.CONFIRMED : existing.status;
  const paidAt = paymentStatus === PAYMENT_STATUSES.PAID ? now : existing.paid_at;

  db.prepare(`UPDATE orders SET payment_status = ?, status = ?,
    reservation_status = CASE WHEN ? = 'paid' AND reservation_status = 'awaiting_payment' THEN 'confirmed' ELSE reservation_status END,
    paid_at = ?, updated_at = ? WHERE id = ?`)
    .run(paymentStatus, newOrderStatus, paymentStatus, paidAt, now, req.params.id);
  if (paymentStatus === PAYMENT_STATUSES.PAID) applyOrderFulfillmentEffects(req.params.id);

  db.prepare(`
    UPDATE payments SET
      status = ?,
      notes = COALESCE(?, notes),
      verified_by = ?,
      received_by_user_id = COALESCE(?, received_by_user_id),
      paid_at = ?,
      updated_at = ?
    WHERE order_id = ?
  `).run(paymentStatus, notes || null, staffName, paymentStatus === PAYMENT_STATUSES.PAID ? req.user.id : null, paidAt, now, req.params.id);

  db.prepare('INSERT INTO order_events (order_id, event_type, status, actor_user_id, occurred_at, metadata) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, 'payment_status_changed', paymentStatus, req.user.id, now, JSON.stringify({ staffName, notes }));

  const order = getOrderById(req.params.id);
  if (paymentStatus === PAYMENT_STATUSES.PAID && order?.customerEmail) {
    try { enqueueOrderEmail(order.id, 'paid_invoice'); }
    catch (error) { console.error(`Could not queue paid invoice for order ${order.id}:`, error.message); }
  }
  broadcast('order:updated', order);
  if (paymentStatus === PAYMENT_STATUSES.PAID) {
    broadcast('order:confirmed', order);
    broadcast('payment:confirmed', { orderId: order.id, paymentReference: order.paymentReference });
  }

  res.json(order);
});

router.delete('/:id', authMiddleware, deletionViewer, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.dine_in_tab_id && db.prepare("SELECT 1 FROM dine_in_tabs WHERE id = ? AND status = 'open'").get(order.dine_in_tab_id)) {
    return res.status(409).json({ error: 'Tickets cannot be deleted while their table tab is open.' });
  }
  recordDeletion({ resourceType: 'order', resourceId: order.id, snapshot: order, reason: req.body?.reason, user: req.user });
  const now = new Date().toISOString();
  const deleteOrder = db.transaction(() => {
    db.prepare('UPDATE tables SET current_order_id = NULL, status = CASE WHEN status = \'occupied\' THEN \'available\' ELSE status END WHERE current_order_id = ?').run(order.id);
    db.prepare('DELETE FROM refunds WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM payments WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM order_events WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
  });
  deleteOrder();
  broadcast('order:deleted', { orderId: order.id, deletedAt: now });
  res.json({ ok: true, orderId: order.id, permanentlyDeleted: true });
});

// Email the paid invoice for an order to the customer (or an address supplied on the spot).
router.post('/:id/send-invoice', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
  const recipient = requestedEmail || String(order.customerEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return res.status(400).json({ error: 'Add an email address to send the invoice to.' });
  }
  if (!['paid', 'completed'].includes(order.paymentStatus)) {
    return res.status(409).json({ error: 'The invoice can only be emailed once the order is paid.' });
  }

  // If a new email was supplied, persist it on the order and customer so future
  // invoices and marketing reach the same address.
  if (requestedEmail && requestedEmail !== String(order.customerEmail || '').trim().toLowerCase()) {
    db.prepare('UPDATE orders SET customer_email = ?, updated_at = ? WHERE id = ?').run(requestedEmail, new Date().toISOString(), order.id);
    const phone = String(order.customerPhone || '').trim();
    const existingCustomer = db.prepare('SELECT id FROM customers WHERE lower(email) = ? OR (? <> \'\' AND phone = ?) LIMIT 1')
      .get(requestedEmail, phone, phone);
    if (existingCustomer) {
      db.prepare("UPDATE customers SET email = ? WHERE id = ? AND (email IS NULL OR email = '')").run(requestedEmail, existingCustomer.id);
    }
  }

  // Reuse the outbox so delivery is retried/tracked. Clear a prior failed/sent row so re-sends work.
  db.prepare("DELETE FROM order_email_outbox WHERE order_id = ? AND email_type = 'paid_invoice'").run(order.id);
  const queued = enqueueOrderEmail(order.id, 'paid_invoice');
  if (!queued) return res.status(409).json({ error: 'An invoice email for this order is already queued or sent.' });
  res.json({ ok: true, queued: true, recipient });
});

export default router;
