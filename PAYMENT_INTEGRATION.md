# Wrap & Roll POS - Secure Payment Integration Guide

## Overview

The Wrap & Roll POS system now includes **Pesapal Integration** - a secure, enterprise-grade payment gateway that supports multiple payment methods popular in Tanzania and East Africa.

### Supported Payment Methods

✅ **Mobile Money:**
- Tigo Pesa
- Airtel Money
- M-Pesa

✅ **Bank Transfers:**
- Direct Bank Account Transfers
- Equity Bank
- Other major Tanzanian banks

✅ **Payment Security:**
- HMAC-SHA256 signature verification
- AES-256 encryption for sensitive data
- Webhook validation
- Constant-time comparison for signatures (prevents timing attacks)
- HTTPS/TLS enforcement
- PCI-DSS compliant payment processing

---

## Setup Instructions

### 1. Create Pesapal Account

1. Sign up at [https://www.pesapal.com](https://www.pesapal.com)
2. Complete merchant verification
3. Navigate to **Settings → API Credentials**
4. Get your credentials:
   - **Consumer Key** (OAuth)
   - **Consumer Secret** (OAuth)
   - **API Key**
   - **Secret Key**

### 2. Configure Environment Variables

Create a `.env` file in the `wrap-roll-pos` root directory:

```bash
# Copy from .env.example
cp .env.example .env

# Edit .env and add Pesapal credentials
```

Add the following to your `.env`:

```env
# Pesapal Payment Gateway
PESAPAL_API_URL=https://api.pesapal.com/api/v3
PESAPAL_CONSUMER_KEY=your_consumer_key_here
PESAPAL_CONSUMER_SECRET=your_consumer_secret_here
PESAPAL_API_KEY=your_api_key_here
PESAPAL_SECRET_KEY=your_secret_key_here

# Feature Flags
ENABLE_CARD_PAYMENTS=true
ENABLE_MOBILE_MONEY=true
ENABLE_BANK_TRANSFERS=true
ENABLE_CASH_PAYMENTS=true
ENABLE_REFUNDS=true
```

### 3. Install Dependencies

The payment system uses built-in Node.js crypto modules (no additional packages needed).

```bash
npm install
```

### 4. Database Migration

The system automatically creates required tables:
- `payments` - Payment transaction records
- `refunds` - Refund tracking

These are created on first run with the new schema migration.

---

## API Endpoints

### 1. Get Payment Methods

```
GET /api/payments/methods
```

**Response:**
```json
{
  "success": true,
  "methods": [
    {
      "id": "tigo_pesa",
      "label": "Tigo Pesa",
      "provider": "TIGO",
      "type": "mobile_money",
      "description": "Tigo Money Transfer",
      "icon": "smartphone"
    },
    // ... more methods
  ],
  "supportedCurrencies": ["TZS", "USD", "KES"]
}
```

### 2. Initiate Payment

```
POST /api/payments/initiate
```

**Request Body:**
```json
{
  "orderId": "ORD-20240115-001",
  "amount": 50000,
  "currency": "TZS",
  "customerEmail": "customer@example.com",
  "customerPhone": "+255700000000",
  "paymentMethod": "tigo_pesa",
  "description": "Order payment"
}
```

**Response:**
```json
{
  "success": true,
  "paymentId": "PAY-1705313400000-a1b2c3d4",
  "orderTrackingId": "pesapal_tracking_id",
  "redirectUrl": "https://pesapal.com/payment/...",
  "amount": 50000,
  "currency": "TZS",
  "paymentMethod": "Tigo Pesa"
}
```

### 3. Check Payment Status

```
GET /api/payments/{paymentId}/status
```

**Response:**
```json
{
  "success": true,
  "paymentId": "PAY-1705313400000-a1b2c3d4",
  "orderId": "ORD-20240115-001",
  "status": "completed",
  "amount": 50000,
  "currency": "TZS",
  "paymentMethod": "tigo_pesa",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### 4. Process Refund (Admin Only)

```
POST /api/payments/{paymentId}/refund
Authorization: Bearer {auth_token}
```

**Request Body:**
```json
{
  "reason": "Customer requested refund",
  "amount": 50000
}
```

**Response:**
```json
{
  "success": true,
  "refundId": "REF-1705313500000-x1y2z3w4",
  "amount": 50000,
  "status": "processed"
}
```

### 5. Payment Webhook

```
POST /api/payments/webhook
```

Pesapal sends payment confirmation to this endpoint. The system validates:
- HMAC signature
- Payment status with Pesapal
- Order existence
- Amount verification

---

## Security Features

### 1. HMAC Signature Verification

All webhook payloads are verified using HMAC-SHA256:

```javascript
// Signature generation
const signature = crypto
  .createHmac('sha256', PESAPAL_SECRET_KEY)
  .update(data)
  .digest('base64');
```

### 2. Encryption

Sensitive payment data can be encrypted using AES-256:

```javascript
// Encryption
encryptPaymentData(paymentData, secretKey);

// Decryption
decryptPaymentData(encryptedData, secretKey);
```

### 3. Timing Attack Prevention

Signature comparison uses constant-time comparison:

```javascript
crypto.timingSafeEqual(
  Buffer.from(receivedSignature),
  Buffer.from(expectedSignature)
);
```

### 4. API Request Security

- HTTPS/TLS enforced in production
- Authorization headers for sensitive endpoints
- Role-based access control (admin only for refunds)
- Request validation and sanitization
- SQL injection prevention via parameterized queries

### 5. Payment Data Isolation

Payment information is:
- Never stored in plain text
- Separated from customer data
- Logged for audit trails
- Accessible only by authorized staff

---

## Frontend Integration

### Payment Page Component

The updated `PaymentPage.jsx` includes:

1. **Payment Method Selection**
   - Displays all available methods from API
   - Dynamic icon mapping
   - Visual selection feedback

2. **Customer Information**
   - Email validation (required)
   - Phone number validation (required)
   - Sanitized input handling

3. **Payment Processing**
   - Order creation
   - Pesapal integration
   - Automatic status polling
   - Error handling

4. **Status Polling**
   - Polls every 3 seconds
   - Maximum 60 attempts (3 minutes)
   - Automatic redirect on completion

### Payment Client Service

```javascript
import PaymentClient from '../../api/paymentClient';

// Get payment methods
const methods = await PaymentClient.getPaymentMethods();

// Initiate payment
const payment = await PaymentClient.initiatePayment({
  orderId: 'ORD-001',
  amount: 50000,
  currency: 'TZS',
  customerEmail: 'customer@example.com',
  customerPhone: '+255700000000',
  paymentMethod: 'tigo_pesa',
});

// Check status
const status = await PaymentClient.checkPaymentStatus(paymentId);

// Poll until completion
const finalStatus = await PaymentClient.pollPaymentStatus(paymentId);
```

---

## Testing

### 1. Development Mode

```bash
# Start development server
npm run dev

# Pesapal provides sandbox credentials for testing
# Use sandbox API URL in .env for testing
PESAPAL_API_URL=https://sandbox.pesapal.com/api/v3
```

### 2. Payment Simulation

During testing:
1. Create an order
2. Select a payment method
3. Enter test email/phone
4. Pesapal opens in new tab
5. Complete test payment in Pesapal
6. System automatically confirms

### 3. Test Credentials

Contact Pesapal support for:
- Sandbox merchant credentials
- Test payment numbers
- Test mobile money account

### 4. Webhook Testing

Test webhook with:
```bash
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "X-Pesapal-Signature: signature_here" \
  -d '{
    "order_tracking_id": "tracking_id",
    "status": "1"
  }'
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Update `.env` with **production** Pesapal credentials
- [ ] Change `NODE_ENV=production`
- [ ] Set `HTTPS_ONLY=true`
- [ ] Update callback URLs to production domain
- [ ] Enable security headers
- [ ] Set up SSL/TLS certificates
- [ ] Test payment flow end-to-end
- [ ] Configure webhook firewall rules
- [ ] Enable audit logging
- [ ] Set up payment monitoring
- [ ] Configure email notifications
- [ ] Review Pesapal security guidelines

### Environment Configuration

```env
# Production .env
NODE_ENV=production
HTTPS_ONLY=true
API_BASE_URL=https://yourdomain.com

# Pesapal Production Credentials
PESAPAL_API_URL=https://api.pesapal.com/api/v3
PESAPAL_CONSUMER_KEY=your_production_key
PESAPAL_CONSUMER_SECRET=your_production_secret
PESAPAL_API_KEY=your_production_api_key
PESAPAL_SECRET_KEY=your_production_secret

# Features
ENABLE_REFUNDS=true
ENABLE_MOBILE_MONEY=true
ENABLE_BANK_TRANSFERS=true
```

### Monitoring & Logging

Monitor these metrics:
- Payment success rate
- Average payment processing time
- Failed payment attempts
- Webhook delivery failures
- Refund requests and status

---

## Troubleshooting

### Payment Won't Initialize

**Error:** "Failed to initiate payment"

**Solutions:**
- Verify Pesapal credentials in `.env`
- Check internet connectivity
- Validate customer email format
- Ensure API URL is correct for environment (sandbox vs production)

### Webhook Not Received

**Error:** "Payment status not updating"

**Solutions:**
- Verify webhook URL is publicly accessible
- Check firewall rules
- Verify HTTPS certificate validity
- Test webhook with `curl` command
- Check Pesapal webhook logs

### Payment Stuck in "Waiting"

**Error:** Payment shows as "waiting" indefinitely

**Solutions:**
- Manually check status with `/api/payments/{id}/status`
- Verify order was created successfully
- Check Pesapal dashboard for order status
- Reset polling by refreshing page
- Contact Pesapal support if status shows "failed"

### Authorization Errors

**Error:** "401 Unauthorized" from Pesapal

**Solutions:**
- Verify Consumer Key and Secret are correct
- Check credentials haven't expired
- Ensure OAuth credentials have "payments" scope
- Regenerate credentials in Pesapal dashboard

---

## Database Schema

### Payments Table

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'TZS',
  payment_method TEXT NOT NULL,
  pesapal_order_id TEXT UNIQUE,
  status TEXT DEFAULT 'initiated',
  initiated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

### Refunds Table

```sql
CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT,
  pesapal_refund_id TEXT,
  status TEXT DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);
```

---

## Support & Resources

- **Pesapal Documentation:** https://developer.pesapal.com/
- **Pesapal API Reference:** https://developer.pesapal.com/api
- **Pesapal Support:** support@pesapal.com
- **Wrap & Roll GitHub:** [Your repository]

---

## Security Best Practices

1. **Keep API Keys Secret**
   - Never commit `.env` to version control
   - Rotate credentials regularly
   - Use different credentials for sandbox and production

2. **Monitor Payment Activity**
   - Review payment logs regularly
   - Alert on unusual patterns
   - Track failed transactions

3. **Validate All Inputs**
   - Email and phone validation
   - Amount verification
   - Order existence checks

4. **Webhook Security**
   - Always validate signatures
   - Use HTTPS only
   - Implement retry logic
   - Log all webhook attempts

5. **Error Handling**
   - Don't expose sensitive details in errors
   - Log full errors server-side
   - Show generic messages to users

---

## Changelog

### v1.0.0 (2024-01-15)

- ✅ Pesapal integration implemented
- ✅ Support for Tigo Pesa, Airtel Money, M-Pesa
- ✅ Bank transfer support
- ✅ HMAC-SHA256 signature verification
- ✅ AES-256 encryption for sensitive data
- ✅ Webhook validation
- ✅ Refund processing
- ✅ Frontend payment UI
- ✅ Payment status polling
- ✅ Comprehensive error handling

---

**Last Updated:** January 15, 2024
**Maintained By:** Wrap & Roll Development Team
