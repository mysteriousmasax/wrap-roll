# Quick Start: Pesapal Payment Integration

## 5-Minute Setup

### Step 1: Get Pesapal Credentials (5 min)

1. Go to https://www.pesapal.com
2. Create a merchant account
3. Get your credentials from Settings → API:
   - `PESAPAL_CONSUMER_KEY`
   - `PESAPAL_CONSUMER_SECRET`
   - `PESAPAL_API_KEY`
   - `PESAPAL_SECRET_KEY`

### Step 2: Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit .env file
PESAPAL_CONSUMER_KEY=xxx
PESAPAL_CONSUMER_SECRET=xxx
PESAPAL_API_KEY=xxx
PESAPAL_SECRET_KEY=xxx
```

### Step 3: Start Server

```bash
npm run dev
```

### Step 4: Test Payment

1. Go to http://localhost:3000/pos
2. Add items to cart
3. Proceed to payment
4. Select Tigo Pesa, Airtel Money, M-Pesa, or Bank Transfer
5. Enter email and phone
6. Click "Pay"
7. Complete payment in Pesapal

---

## Security Checklist

✅ **Enabled by Default:**
- HMAC-SHA256 signature verification
- AES-256 encryption for sensitive data
- Timing attack prevention
- SQL injection protection
- HTTPS enforcement in production
- Role-based access control

✅ **Production Only:**
- Set `NODE_ENV=production`
- Use production Pesapal credentials
- Enable SSL/TLS certificates
- Set `HTTPS_ONLY=true`

---

## Available Payment Methods

| Method | Type | Provider |
|--------|------|----------|
| Tigo Pesa | Mobile Money | TIGO |
| Airtel Money | Mobile Money | AIRTEL |
| M-Pesa | Mobile Money | SAFARICOM |
| Bank Transfer | Bank | Multiple |
| Equity Bank | Bank | EQUITY |

---

## API Examples

### Get Payment Methods
```bash
curl http://localhost:3000/api/payments/methods
```

### Initiate Payment
```bash
curl -X POST http://localhost:3000/api/payments/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-001",
    "amount": 50000,
    "currency": "TZS",
    "customerEmail": "test@example.com",
    "customerPhone": "+255700000000",
    "paymentMethod": "tigo_pesa"
  }'
```

### Check Payment Status
```bash
curl http://localhost:3000/api/payments/PAY-xxx/status
```

---

## Webhook Testing

```bash
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "X-Pesapal-Signature: test" \
  -d '{
    "order_tracking_id": "xxx",
    "payment_status": 1,
    "amount": 50000
  }'
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API credentials not configured" | Add credentials to `.env` |
| "Failed to get auth token" | Verify credentials are correct |
| "Payment not updating" | Check webhook is publicly accessible |
| "401 Unauthorized" | Regenerate Pesapal credentials |

---

## File Structure

```
wrap-roll-pos/
├── server/
│   ├── utils/payment.js          # Pesapal integration
│   ├── routes/payments.js         # Payment API endpoints
│   └── db/database.js             # Payment tables
├── src/
│   ├── api/paymentClient.js       # Frontend payment client
│   ├── pages/pos/PaymentPage.jsx  # Payment UI
│   └── constants/index.js         # Payment methods
└── .env.example                   # Configuration template
```

---

## Support

- **Pesapal Docs:** https://developer.pesapal.com/
- **Issues:** Check logs in server terminal
- **Security:** See PAYMENT_INTEGRATION.md

---

**Deployment Ready! 🚀**
