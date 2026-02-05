# 🛡️ SECURITY IMPLEMENTATION GUIDE

## Quick Start - Critical Fixes (Do This First!)

### Step 1: Install Security Dependencies

```bash
cd backend
npm install express-rate-limit helmet express-validator cors
```

### Step 2: Update server.js

Add security middleware to your Express server:

```javascript
const express = require('express');
const {
  securityHeaders,
  apiLimiter,
  requestId,
  preventDebugLogging,
  sanitizeErrors
} = require('./middleware/security');

const app = express();

// 1. Request ID (first middleware)
app.use(requestId);

// 2. Security headers
app.use(securityHeaders);

// 3. Prevent debug logging in production
app.use(preventDebugLogging);

// 4. Rate limiting (apply to all routes)
app.use('/api/', apiLimiter);

// 5. Body parser (existing)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 6. CORS (existing - update with strict settings)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ... your routes ...

// 7. Error handler (last middleware)
app.use(sanitizeErrors);
```

### Step 3: Secure Authentication Routes

Update your auth routes:

```javascript
const { authLimiter } = require('./middleware/security');

// Apply strict rate limiting to auth endpoints
router.post('/login', authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
```

### Step 4: Add Input Validation

Example for order creation:

```javascript
const {
  validateUUID,
  validateOrderStatus,
  sanitizeString,
  handleValidationErrors
} = require('./middleware/security');

router.post('/orders',
  protect,
  authorize('admin', 'client'),
  [
    validateUUID('clientId'),
    validateOrderStatus,
    sanitizeString('notes'),
    handleValidationErrors
  ],
  orderController.createOrder
);
```

### Step 5: Remove Debug Logging

**CRITICAL:** Remove all debug logging from production code:

```javascript
// ❌ REMOVE THIS:
const DEBUG_LOG_PATH = '/Users/harsha_reddy/3PLFAST/.cursor/debug.log';
fs.appendFileSync(DEBUG_LOG_PATH, ...);

// ✅ USE THIS INSTEAD:
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG]', data);
}
```

### Step 6: Update Environment Variables

Add to `.env`:

```bash
# Security
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
SESSION_SECRET=your-super-secret-key-here-min-32-chars

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=5
```

---

## Detailed Implementation

### 1. Authentication Security

#### Strengthen Session Management

```javascript
// backend/controllers/supabaseAuthController.js

// Update cookie settings
res.cookie('sb-access-token', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict', // Changed from 'lax'
  maxAge: 24 * 60 * 60 * 1000, // Reduced to 24 hours
  domain: process.env.COOKIE_DOMAIN, // Add domain restriction
  path: '/'
});
```

#### Add Account Lockout

```javascript
// Create new file: backend/utils/accountLockout.js

const supabaseAdmin = require('../config/supabaseAdmin');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

async function checkAccountLockout(email) {
  const { data } = await supabaseAdmin
    .from('login_attempts')
    .select('*')
    .eq('email', email)
    .gte('attempted_at', new Date(Date.now() - LOCKOUT_DURATION).toISOString())
    .order('attempted_at', { ascending: false });

  const failedAttempts = data?.filter(a => a.status === 'failed').length || 0;

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return {
      locked: true,
      message: 'Account temporarily locked due to too many failed attempts'
    };
  }

  return { locked: false };
}

async function recordLoginAttempt(email, status, ip) {
  await supabaseAdmin
    .from('login_attempts')
    .insert({
      email,
      status,
      ip_address: ip,
      attempted_at: new Date().toISOString()
    });
}

module.exports = { checkAccountLockout, recordLoginAttempt };
```

### 2. Authorization Security

#### Strict Client Data Access

```javascript
// Apply to all client-specific routes
const { strictClientAuth } = require('./middleware/security');

router.get('/orders',
  protect,
  authorize('admin', 'client'),
  strictClientAuth, // Add this
  orderController.getOrders
);
```

#### Order Status State Machine

```javascript
// backend/utils/orderStateMachine.js

const VALID_TRANSITIONS = {
  'pending': ['approved', 'cancelled'],
  'approved': ['packed', 'cancelled'],
  'packed': ['dispatched', 'cancelled'],
  'dispatched': [], // Final state
  'cancelled': [] // Final state
};

function validateStatusTransition(currentStatus, newStatus) {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
  
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid status transition from ${currentStatus} to ${newStatus}`
    );
  }
  
  return true;
}

module.exports = { validateStatusTransition };
```

### 3. Financial Security

#### Invoice Amount Validation

```javascript
// backend/utils/invoiceValidator.js

function validateInvoiceAmount(orders) {
  let calculatedTotal = 0;
  
  for (const order of orders) {
    const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const orderAmount = 2.50 + (units - 1) * 1.25;
    calculatedTotal += orderAmount;
  }
  
  return {
    calculatedTotal: parseFloat(calculatedTotal.toFixed(2)),
    orderCount: orders.length
  };
}

function verifyInvoiceIntegrity(invoice, orders) {
  const validation = validateInvoiceAmount(orders);
  
  if (Math.abs(invoice.total_amount - validation.calculatedTotal) > 0.01) {
    throw new Error(
      'Invoice amount mismatch. Calculated: ' + validation.calculatedTotal +
      ', Provided: ' + invoice.total_amount
    );
  }
  
  return true;
}

module.exports = { validateInvoiceAmount, verifyInvoiceIntegrity };
```

#### Apply to Invoice Generation

```javascript
// backend/services/invoiceGenerationService.js

const { verifyInvoiceIntegrity } = require('../utils/invoiceValidator');

async function generateMonthlyInvoice(clientId, startDate, endDate) {
  // ... fetch orders ...
  
  // Calculate amounts server-side
  const validation = validateInvoiceAmount(orders);
  
  const invoiceData = {
    client_id: clientId,
    total_amount: validation.calculatedTotal,
    // ... other fields ...
  };
  
  // Verify integrity before saving
  verifyInvoiceIntegrity(invoiceData, orders);
  
  // ... save invoice ...
}
```

### 4. Audit Logging

#### Financial Operations Audit

```javascript
const { auditLog } = require('./middleware/security');

// Apply to all financial endpoints
router.post('/invoices/generate',
  protect,
  authorize('admin'),
  auditLog('INVOICE_GENERATE'),
  invoiceController.generateInvoice
);

router.post('/invoices/:id/payment',
  protect,
  authorize('admin'),
  auditLog('PAYMENT_RECORD'),
  invoiceController.recordPayment
);
```

#### Create Audit Log Table

```sql
-- Run this migration in Supabase

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES user_profiles(id),
  user_role VARCHAR(20),
  client_id UUID REFERENCES clients(id),
  resource_type VARCHAR(50),
  resource_id UUID,
  method VARCHAR(10),
  path TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### 5. Input Validation Examples

#### Order Creation

```javascript
router.post('/orders',
  protect,
  authorize('admin', 'client'),
  [
    body('clientId').isUUID().withMessage('Invalid client ID'),
    body('items').isArray({ min: 1 }).withMessage('At least one item required'),
    body('items.*.productId').isUUID().withMessage('Invalid product ID'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
    body('priority').isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
    body('notes').optional().trim().isLength({ max: 500 }),
    handleValidationErrors
  ],
  orderController.createOrder
);
```

#### Invoice Payment

```javascript
router.post('/invoices/:id/payment',
  protect,
  authorize('admin'),
  [
    validateUUID('id'),
    validateAmount('amount'),
    body('paymentMethod').isIn(['cash', 'check', 'bank_transfer', 'credit_card']),
    body('referenceNumber').optional().trim().isLength({ max: 100 }),
    validateDate('paymentDate'),
    handleValidationErrors
  ],
  invoiceController.recordPayment
);
```

---

## Testing Security

### 1. Test Rate Limiting

```bash
# Test auth rate limit (should block after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo "\nAttempt $i"
done
```

### 2. Test Authorization

```bash
# Try to access another client's data (should fail)
curl -X GET http://localhost:5000/api/orders?clientId=other-client-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test Input Validation

```bash
# Try invalid UUID (should fail)
curl -X GET http://localhost:5000/api/orders/invalid-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"

# Try SQL injection (should be blocked)
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"1 OR 1=1","items":[]}'
```

---

## Monitoring & Alerts

### Set Up Security Monitoring

```javascript
// backend/utils/securityMonitor.js

const ALERT_THRESHOLDS = {
  FAILED_LOGINS_PER_HOUR: 10,
  RATE_LIMIT_VIOLATIONS_PER_HOUR: 50,
  AUTH_FAILURES_PER_HOUR: 20
};

async function checkSecurityMetrics() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  // Check failed logins
  const { count: failedLogins } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('attempted_at', oneHourAgo.toISOString());
  
  if (failedLogins > ALERT_THRESHOLDS.FAILED_LOGINS_PER_HOUR) {
    sendSecurityAlert('HIGH_FAILED_LOGIN_RATE', {
      count: failedLogins,
      threshold: ALERT_THRESHOLDS.FAILED_LOGINS_PER_HOUR
    });
  }
  
  // Add more checks...
}

// Run every 5 minutes
setInterval(checkSecurityMetrics, 5 * 60 * 1000);
```

---

## Compliance Checklist

### GDPR Compliance

- [ ] Add data retention policy
- [ ] Implement right to erasure
- [ ] Add consent management
- [ ] Create data processing agreement
- [ ] Implement data export functionality
- [ ] Add privacy policy
- [ ] Log data access

### PCI-DSS Compliance

- [ ] Never store full credit card numbers
- [ ] Use tokenization for payments
- [ ] Encrypt sensitive data at rest
- [ ] Implement access controls
- [ ] Regular security scans
- [ ] Maintain audit logs
- [ ] Secure network configuration

### SOC 2 Compliance

- [ ] Document security policies
- [ ] Implement change management
- [ ] Regular security training
- [ ] Incident response plan
- [ ] Vendor management
- [ ] Business continuity plan
- [ ] Regular audits

---

## Security Checklist

### Before Deployment

- [ ] All debug logging removed
- [ ] Environment variables secured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] Authorization checks on all routes
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] Database credentials rotated
- [ ] API keys in secure vault
- [ ] Error messages sanitized
- [ ] Audit logging enabled
- [ ] Monitoring configured
- [ ] Backup tested
- [ ] Incident response plan documented

### Monthly Review

- [ ] Review audit logs
- [ ] Check for security updates
- [ ] Rotate credentials
- [ ] Review access controls
- [ ] Test backup recovery
- [ ] Update dependencies
- [ ] Security scan
- [ ] Penetration test (quarterly)

---

## Emergency Response

### If Breach Detected

1. **Immediate Actions:**
   - Isolate affected systems
   - Revoke all active sessions
   - Rotate all credentials
   - Enable maintenance mode

2. **Investigation:**
   - Review audit logs
   - Identify entry point
   - Assess data exposure
   - Document timeline

3. **Remediation:**
   - Patch vulnerabilities
   - Restore from clean backup
   - Notify affected users
   - Report to authorities (if required)

4. **Post-Incident:**
   - Conduct post-mortem
   - Update security measures
   - Improve monitoring
   - Train team

---

## Support

For security issues or questions:
- Email: security@max2pay.com
- Slack: #security-team
- Emergency: +1-XXX-XXX-XXXX

**Remember: Security is everyone's responsibility!**
