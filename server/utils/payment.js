/**
 * Pesapal Payment Gateway Integration
 * Secure payment processing for Tanzanian payment methods
 */

import crypto from 'crypto';

const PESAPAL_BASE_URL = process.env.PESAPAL_API_URL || 'https://api.pesapal.com/api/v3';
const PESAPAL_API_KEY = process.env.PESAPAL_API_KEY;
const PESAPAL_SECRET_KEY = process.env.PESAPAL_SECRET_KEY;
const PESAPAL_CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY;
const PESAPAL_CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;

export function isPaymentDemoMode() {
  return !PESAPAL_API_KEY || !PESAPAL_SECRET_KEY || !PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET;
}

/**
 * Payment Methods available through Pesapal
 */
export const PESAPAL_PAYMENT_METHODS = [
  {
    id: 'tigo_pesa',
    label: 'Tigo Pesa',
    provider: 'TIGO',
    type: 'mobile_money',
    description: 'Tigo Money Transfer',
    icon: 'smartphone',
  },
  {
    id: 'airtel_money',
    label: 'Airtel Money',
    provider: 'AIRTEL',
    type: 'mobile_money',
    description: 'Airtel Money Transfer',
    icon: 'smartphone',
  },
  {
    id: 'mpesa',
    label: 'M-Pesa',
    provider: 'MPESA',
    type: 'mobile_money',
    description: 'Safaricom M-Pesa',
    icon: 'smartphone',
  },
  {
    id: 'bank_transfer',
    label: 'Bank Transfer',
    provider: 'BANK',
    type: 'bank_transfer',
    description: 'Direct Bank Account Transfer',
    icon: 'building',
  },
  {
    id: 'equity_bank',
    label: 'Equity Bank',
    provider: 'EQUITY',
    type: 'bank_account',
    description: 'Equity Bank Direct',
    icon: 'building',
  },
];

/**
 * Generate HMAC signature for API requests
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} Base64 encoded signature
 */
export function generateSignature(data, secret = PESAPAL_SECRET_KEY) {
  if (!secret) {
    throw new Error('PESAPAL_SECRET_KEY not configured');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64');
}

/**
 * Encrypt sensitive payment data
 * @param {object} data - Data to encrypt
 * @param {string} encryptionKey - Encryption key
 * @returns {string} Encrypted data
 */
export function encryptPaymentData(data, encryptionKey = PESAPAL_SECRET_KEY) {
  const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * Decrypt payment data
 * @param {string} encrypted - Encrypted data
 * @param {string} encryptionKey - Encryption key
 * @returns {object} Decrypted data
 */
export function decryptPaymentData(encrypted, encryptionKey = PESAPAL_SECRET_KEY) {
  const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

/**
 * Create Pesapal payment order
 * @param {object} orderData - Order information
 * @returns {Promise<object>} Payment order response
 */
export async function createPesapalOrder(orderData) {
  const {
    orderId,
    amount,
    currency = 'TZS',
    description,
    customerEmail,
    customerPhone,
    paymentMethod,
    callbackUrl,
    redirectUrl,
  } = orderData;

  if (isPaymentDemoMode()) {
    const demoTrackingId = `DEMO-${orderId || Date.now()}`;
    const demoRedirectUrl = redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pos/success?orderId=${encodeURIComponent(orderId || 'demo')}&demo=1`;
    return {
      success: true,
      demoMode: true,
      orderTrackingId: demoTrackingId,
      redirectUrl: demoRedirectUrl,
      amount,
      currency,
      paymentMethod,
      createdAt: new Date().toISOString(),
    };
  }

  if (!PESAPAL_API_KEY || !PESAPAL_SECRET_KEY) {
    throw new Error('Pesapal API credentials not configured');
  }

  try {
    // First, get authentication token
    const authToken = await getPesapalAuthToken();

    // Prepare order payload
    const orderPayload = {
      id: orderId,
      currency,
      amount: parseFloat(amount).toString(),
      description: description || `Order ${orderId}`,
      callback_url: callbackUrl,
      redirect_url: redirectUrl,
      billing_address: {
        email_address: customerEmail,
        phone_number: customerPhone,
        first_name: 'Customer',
        last_name: 'Order',
      },
      payment_method: paymentMethod,
    };

    const response = await fetch(`${PESAPAL_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Pesapal API Error: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();

    // Log transaction for audit trail
    console.log(`✓ Pesapal order created: ${result.order_tracking_id}`);

    return {
      success: true,
      orderTrackingId: result.order_tracking_id,
      redirectUrl: result.redirect_url,
      amount,
      currency,
      paymentMethod,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Pesapal order creation failed:', error);
    throw new Error(`Payment processing failed: ${error.message}`);
  }
}

/**
 * Get Pesapal authentication token
 * @returns {Promise<string>} Authentication token
 */
async function getPesapalAuthToken() {
  if (!PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET) {
    throw new Error('Pesapal OAuth credentials not configured');
  }

  try {
    const authString = btoa(`${PESAPAL_CONSUMER_KEY}:${PESAPAL_CONSUMER_SECRET}`);

    const response = await fetch(`${PESAPAL_BASE_URL}/api/auth/token`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get Pesapal authentication token');
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Pesapal authentication failed:', error);
    throw error;
  }
}

/**
 * Check payment status
 * @param {string} orderTrackingId - Pesapal order tracking ID
 * @returns {Promise<object>} Payment status
 */
export async function checkPaymentStatus(orderTrackingId) {
  if (isPaymentDemoMode()) {
    return {
      success: true,
      status: 'completed',
      statusCode: 1,
      amount: 0,
      currency: 'TZS',
      orderTrackingId,
      lastUpdated: new Date().toISOString(),
    };
  }

  if (!PESAPAL_API_KEY) {
    throw new Error('Pesapal API not configured');
  }

  try {
    const authToken = await getPesapalAuthToken();

    const response = await fetch(`${PESAPAL_BASE_URL}/orders/${orderTrackingId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to check payment status');
    }

    const result = await response.json();

    return {
      success: true,
      status: result.payment_status_description,
      statusCode: result.payment_status,
      amount: result.amount,
      currency: result.currency,
      orderTrackingId: result.order_tracking_id,
      lastUpdated: result.created_date,
    };
  } catch (error) {
    console.error('Payment status check failed:', error);
    throw error;
  }
}

/**
 * Validate webhook payload from Pesapal
 * @param {object} payload - Webhook payload
 * @param {string} signature - Received signature
 * @returns {boolean} Validation result
 */
export function validateWebhookSignature(payload, signature) {
  const dataToSign = JSON.stringify(payload);
  const expectedSignature = generateSignature(dataToSign);
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validate payment webhook
 * @param {string} orderTrackingId - Order tracking ID from webhook
 * @param {object} webhookData - Webhook payload
 * @returns {Promise<object>} Validation result
 */
export async function validatePaymentWebhook(orderTrackingId, webhookData) {
  try {
    // Verify the order tracking ID matches
    if (webhookData.order_tracking_id !== orderTrackingId) {
      return { valid: false, reason: 'Order ID mismatch' };
    }

    // Check payment status with Pesapal
    const status = await checkPaymentStatus(orderTrackingId);

    return {
      valid: status.statusCode === 1 || status.statusCode === 2, // 1=completed, 2=pending
      status: status.status,
      statusCode: status.statusCode,
      amount: status.amount,
      currency: status.currency,
    };
  } catch (error) {
    console.error('Webhook validation failed:', error);
    return { valid: false, reason: error.message };
  }
}

/**
 * Refund payment
 * @param {string} orderTrackingId - Original order tracking ID
 * @param {number} amount - Amount to refund (optional, full refund if not specified)
 * @returns {Promise<object>} Refund result
 */
export async function refundPayment(orderTrackingId, amount = null) {
  if (isPaymentDemoMode()) {
    return {
      success: true,
      refundId: `REF-${Date.now()}`,
      amount: amount ?? 0,
      status: 'processed',
      demoMode: true,
    };
  }

  if (!PESAPAL_API_KEY) {
    throw new Error('Pesapal API not configured');
  }

  try {
    const authToken = await getPesapalAuthToken();

    const refundPayload = {
      order_tracking_id: orderTrackingId,
      amount: amount ? parseFloat(amount).toString() : null,
      reason: 'Customer requested refund',
    };

    const response = await fetch(`${PESAPAL_BASE_URL}/orders/${orderTrackingId}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(refundPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Refund failed: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();

    console.log(`✓ Refund processed: ${result.refund_id}`);

    return {
      success: true,
      refundId: result.refund_id,
      amount: result.amount,
      status: result.status,
    };
  } catch (error) {
    console.error('Refund processing failed:', error);
    throw error;
  }
}

export default {
  PESAPAL_PAYMENT_METHODS,
  generateSignature,
  encryptPaymentData,
  decryptPaymentData,
  createPesapalOrder,
  checkPaymentStatus,
  validateWebhookSignature,
  validatePaymentWebhook,
  refundPayment,
};
