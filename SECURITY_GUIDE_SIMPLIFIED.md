# 🔒 Security Guide - Simple & Production-Ready

**Goal:** Secure enough for real clients, simple enough to understand in 1 day.

---

## 📋 5 Security Layers (In Order)

```
Request → Rate Limit → Headers → Auth → Validation → Business Logic → Response
```

### Layer 1: Rate Limiting
**Purpose:** Prevent brute force attacks

```javascript
// server.js
const { authLimiter, apiLimiter } = require('./middleware/security');

app.use('/api/auth/login', authLimiter);  // 5 attempts per 15 min
app.use('/api/', apiLimiter);              // 100 requests per min
```

### Layer 2: Security Headers
**Purpose:** Prevent XSS, clickjacking, MITM

```javascript
const { securityHeaders } = require('./middleware/security');
app.use(securityHeaders);
```

### Layer 3: Authentication
**Purpose:** Verify user identity

```javascript
const { protect, authorize } = require('./middleware/supabaseAuth');

// Require login
app.use('/api/orders', protect);

// Require specific role
app.use('/api/invoices', protect, authorize('admin'));
```

### Layer 4: Authorization
**Purpose:** Clients can only see their own data

```javascript
const { restrictToOwnClient } = require('./middleware/security');

app.get('/api/orders', protect, restrictToOwnClient, orderController.getOrders);
```

### Layer 5: Input Validation
**Purpose:** Prevent SQL injection, XSS

```javascript
const { validateUUID, validate } = require('./middleware/security');

app.get('/api/orders/:id', 
  protect,
  validateUUID('id'),
  validate,
  orderController.getOrder
);
```

---

## 💰 Financial Security (MOST IMPORTANT)

### Rule 1: Never Trust Frontend Amounts

```javascript
// ❌ WRONG - Frontend sends amount
app.post('/api/invoices', (req, res) => {
  const amount = req.body.amount; // DANGEROUS!
  // Save invoice...
});

// ✅ CORRECT - Server calculates amount
app.post('/api/invoices', async (req, res) => {
  const orders = await getOrders(req.body.orderIds);
  const amount = calculateInvoiceAmount(orders); // Server-side only
  // Save invoice...
});
```

### Rule 2: Invoiced Orders Are Immutable

```javascript
// Before updating order
const { verifyOrderEditable } = require('./utils/financialSecurity');

await verifyOrderEditable(orderId); // Throws if locked
// Proceed with update...
```

### Rule 3: Validate Status Transitions

```javascript
const { validateStatusTransition } = require('./utils/financialSecurity');

// Only allow: pending → approved → packed → dispatched
validateStatusTransition(currentStatus, newStatus);
```

---

## 🔐 Session Security

### Cookie Settings (Already Configured)

```javascript
res.cookie('sb-access-token', token, {
  httpOnly: true,              // No JavaScript access
  secure: true,                // HTTPS only
  sameSite: 'strict',          // CSRF protection
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
});
```

### Token Validation (Already Configured)

Supabase handles JWT validation automatically in `protect` middleware.

---

## 🧾 Audit Logging

### What to Log (Financial + Auth Only)

```javascript
const { auditLog } = require('./middleware/security');

// Log invoice generation
app.post('/api/invoices/generate',
  protect,
  authorize('admin'),
  auditLog('INVOICE_GENERATE'),
  invoiceController.generate
);

// Log payments
app.post('/api/invoices/:id/payment',
  protect,
  authorize('admin'),
  auditLog('PAYMENT_RECORD'),
  invoiceController.recordPayment
);

// Log logins (already done in auth controller)
```

### Audit Log Table (Already Created)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  action VARCHAR(100),
  user_id UUID,
  client_id UUID,
  ip_address VARCHAR(45),
  status_code INTEGER,
  created_at TIMESTAMP
);
```

---

## 🚫 What NOT to Do

### 1. Never Log Sensitive Data

```javascript
// ❌ WRONG
console.log('Password:', req.body.password);
console.log('Token:', req.headers.authorization);

// ✅ CORRECT
console.log('Login attempt for:', req.body.email);
```

### 2. Never Use Hardcoded Paths

```javascript
// ❌ WRONG
const logPath = '/Users/harsha_reddy/debug.log';

// ✅ CORRECT
const logPath = process.env.LOG_PATH || './logs/app.log';
```

### 3. Never Trust Frontend for Financial Data

```javascript
// ❌ WRONG
const total = req.body.total;

// ✅ CORRECT
const total = calculateInvoiceAmount(orders);
```

### 4. Never Skip Authorization

```javascript
// ❌ WRONG
app.get('/api/orders', protect, getOrders);

// ✅ CORRECT
app.get('/api/orders', protect, restrictToOwnClient, getOrders);
```

---

## 📦 Installation

### 1. Install Dependencies

```bash
npm install express-rate-limit helmet express-validator
```

### 2. Update server.js

```javascript
const express = require('express');
const { securityHeaders, apiLimiter, sanitizeErrors } = require('./middleware/security');

const app = express();

// Apply security middleware
app.use(securityHeaders);
app.use('/api/', apiLimiter);
app.use(express.json());

// ... your routes ...

// Error handler (last)
app.use(sanitizeErrors);
```

### 3. Update Auth Routes

```javascript
const { authLimiter } = require('./middleware/security');

router.post('/login', authLimiter, authController.login);
```

### 4. Add Authorization to Routes

```javascript
const { restrictToOwnClient } = require('./middleware/security');

router.get('/orders', protect, restrictToOwnClient, orderController.getOrders);
router.get('/invoices', protect, restrictToOwnClient, invoiceController.getInvoices);
```

---

## ✅ Security Checklist

### Before Deployment

- [ ] All debug logging removed
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] Authorization on all routes
- [ ] Financial calculations server-side only
- [ ] Invoice locking enforced
- [ ] Audit logging for financial operations
- [ ] Environment variables secured
- [ ] HTTPS enforced

### Monthly Review

- [ ] Check audit logs for suspicious activity
- [ ] Update dependencies (`npm audit fix`)
- [ ] Review failed login attempts
- [ ] Verify no hardcoded secrets

---

## 🧪 Testing Security

### Test Rate Limiting

```bash
# Should block after 5 attempts
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```

### Test Authorization

```bash
# Client trying to access another client's data (should fail)
curl -X GET "http://localhost:5000/api/orders?clientId=other-uuid" \
  -H "Authorization: Bearer CLIENT_TOKEN"
```

### Test Invoice Locking

```bash
# Try to update invoiced order (should fail)
curl -X PATCH http://localhost:5000/api/orders/INVOICED_ORDER_ID \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status":"cancelled"}'
```

---

## 🚨 If Something Goes Wrong

### Breach Response

1. **Immediate:** Revoke all sessions, enable maintenance mode
2. **Investigate:** Check audit logs, identify entry point
3. **Fix:** Patch vulnerability, restore from backup
4. **Notify:** Inform affected users, report if required

### Emergency Contacts

- Security Lead: [Your Email]
- Database Admin: [Your Email]
- Supabase Support: support@supabase.com

---

## 📚 Key Files

```
backend/
├── middleware/
│   ├── security.js              # 5 security layers
│   └── supabaseAuth.js          # Auth & authorization
├── utils/
│   └── financialSecurity.js     # Invoice & order security
└── SECURITY_GUIDE_SIMPLIFIED.md # This file
```

---

## 🎯 Remember

1. **Rate limiting** prevents brute force
2. **Authorization** isolates client data
3. **Server-side calculations** prevent financial fraud
4. **Invoice locking** ensures accounting integrity
5. **Audit logs** provide accountability

**Security is simple when you follow these 5 rules consistently.**

---

## 💡 Common Scenarios

### Adding a New Endpoint

```javascript
// Template for secure endpoint
router.post('/api/resource',
  protect,                    // Layer 3: Auth
  authorize('admin'),         // Layer 3: Role check
  restrictToOwnClient,        // Layer 4: Client isolation
  [validateUUID('id')],       // Layer 5: Input validation
  validate,                   // Layer 5: Error handler
  auditLog('RESOURCE_CREATE'), // Audit if financial
  controller.create
);
```

### Updating Financial Logic

```javascript
// Always use server-side calculations
const { calculateInvoiceAmount, verifyInvoiceIntegrity } = require('./utils/financialSecurity');

async function generateInvoice(clientId, orderIds) {
  const orders = await getOrders(orderIds);
  
  // Server calculates amount
  const amount = calculateInvoiceAmount(orders);
  
  const invoice = {
    client_id: clientId,
    total_amount: amount,
    // ...
  };
  
  // Verify integrity
  verifyInvoiceIntegrity(invoice, orders);
  
  // Save invoice
  await saveInvoice(invoice);
}
```

### Checking Order Lock Status

```javascript
const { isOrderLocked } = require('./utils/financialSecurity');

async function updateOrder(orderId, updates) {
  // Check if locked
  if (await isOrderLocked(orderId)) {
    throw new Error('Order is locked by invoice');
  }
  
  // Proceed with update
  await updateOrderInDB(orderId, updates);
}
```

---

**That's it! Follow these patterns and your system is production-ready.** 🎉
