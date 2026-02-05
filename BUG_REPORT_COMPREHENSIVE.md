# 🐛 COMPREHENSIVE BUG REPORT & FIXES

**Audit Date:** January 25, 2026  
**System:** Max2Pay 3PL WMS  
**Scope:** Full codebase analysis

---

## 🔍 BUGS IDENTIFIED

### 🔴 CRITICAL BUGS

#### **BUG #1: Debug Logging Exposes Sensitive Data**
**Location:** Multiple files  
**Severity:** 🔴 Critical (Security)

**Files Affected:**
- `middleware/supabaseAuth.js` (lines 3-34, 47-87, 118-123)
- `controllers/supabaseAuthController.js` (lines 82-529)
- `controllers/supabaseOrderController.js` (lines 288-669)
- `config/supabaseAdmin.js` (lines 13-23)

**Issue:**
```javascript
const DEBUG_LOG_PATH = '/Users/harsha_reddy/3PLFAST/.cursor/debug.log';
fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({
  email: req.body?.email,
  hasPassword: !!req.body?.password,
  passwordLength: req.body?.password?.length
}));
```

**Root Cause:** Hardcoded debug logging writes sensitive data (passwords, tokens, user IDs) to filesystem

**Impact:**
- GDPR violation (PII logged without consent)
- Security breach (credentials exposed)
- Hardcoded paths reveal system structure

**Fix:** Remove all debug logging

---

#### **BUG #2: Status Transition Not Validated**
**Location:** `controllers/supabaseOrderController.js:772-1128`  
**Severity:** 🔴 Critical (Business Logic)

**Issue:**
```javascript
exports.updateOrderStatus = async (req, res, next) => {
  const { status } = req.body;
  // No validation of status transition!
  updateData.status = status;
}
```

**Root Cause:** No state machine enforcement - orders can jump from pending → dispatched, skipping approved/packed

**Impact:**
- Workflow bypass
- Inventory inconsistencies
- Invalid order states

**Expected Flow:** pending → approved → packed → dispatched

**Fix:** Add status transition validation using `validateStatusTransition` from `utils/financialSecurity.js`

---

#### **BUG #3: Race Condition in Inventory Updates**
**Location:** `controllers/supabaseOrderController.js:851-888`  
**Severity:** 🔴 Critical (Data Integrity)

**Issue:**
```javascript
// Multiple concurrent dispatches can cause negative inventory
const { data: inventory } = await supabaseAdmin.from('inventory').select('*')...
const newReservedStock = inventory.reserved_stock - item.quantity;
await supabaseAdmin.from('inventory').update({ reserved_stock: newReservedStock })...
```

**Root Cause:** No transaction isolation - read-modify-write is not atomic

**Impact:**
- Negative inventory values
- Stock discrepancies
- Data corruption under load

**Fix:** Use database-level atomic operations or optimistic locking

---

#### **BUG #4: Invoice Locking Check Missing in Order Updates**
**Location:** `controllers/supabaseOrderController.js:772`  
**Severity:** 🔴 Critical (Financial Security)

**Issue:** Order locking is checked in `updateOrderStatus` but NOT in other update endpoints

**Root Cause:** Incomplete implementation - only status updates check locking

**Impact:**
- Invoiced orders can be modified via other endpoints
- Financial data integrity compromised

**Fix:** Add locking check to ALL order modification endpoints

---

### 🟠 HIGH SEVERITY BUGS

#### **BUG #5: Cancelled Status Removed from Frontend**
**Location:** `frontend/src/pages/Orders.jsx:642-648`  
**Severity:** 🟠 High (Business Logic)

**Issue:**
```javascript
options={[
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'packed', label: 'Packed' },
  { value: 'dispatched', label: 'Dispatched' },
  // Cancelled option removed - orders follow linear workflow only
]}
```

**Root Cause:** Frontend removed cancelled status but backend still supports it

**Impact:**
- Orders created by mistake cannot be cancelled
- No way to handle customer cancellations
- Backend/frontend mismatch

**Fix:** Either add cancelled back to frontend OR remove from backend state machine

---

#### **BUG #6: Inventory Rollback Logic Flawed**
**Location:** `controllers/supabaseOrderController.js:619-647`  
**Severity:** 🟠 High (Data Integrity)

**Issue:**
```javascript
// Rollback restores inventory
await supabaseAdmin.from('inventory').update({
  available_stock: inventory.available_stock + update.quantity,
  reserved_stock: inventory.reserved_stock - update.quantity
})
```

**Root Cause:** Rollback fetches inventory AGAIN, which may have changed since original reservation

**Impact:**
- Incorrect stock levels after rollback
- Race condition in error handling

**Fix:** Store original inventory values before modification, use those for rollback

---

#### **BUG #7: Order Locking Uses Two Fields**
**Location:** `services/invoiceGenerationService.js:215-220`  
**Severity:** 🟠 High (Technical Debt)

**Issue:**
```javascript
.update({ 
  invoice_id: invoice.id,  // UUID foreign key
  invoiced_in: invoiceNumber  // String (deprecated)
})
```

**Root Cause:** Migration in progress - both fields used for backward compatibility

**Impact:**
- Data duplication
- Confusion about which field to check
- Inconsistent locking logic

**Fix:** Complete migration - remove `invoiced_in`, use only `invoice_id`

---

#### **BUG #8: Manual Invoice Generation Still Exists in Backend**
**Location:** `controllers/supabaseInvoiceController.js`  
**Severity:** 🟠 High (Business Logic)

**Issue:** Frontend removed manual invoice generation but backend endpoints still exist

**Root Cause:** Incomplete refactoring - backend not updated after frontend changes

**Impact:**
- API endpoints that shouldn't be called
- Potential for duplicate invoices
- Confusion about invoice workflow

**Fix:** Remove or disable manual invoice generation endpoints

---

### 🟡 MEDIUM SEVERITY BUGS

#### **BUG #9: Attachment URL Column Missing Handling**
**Location:** `controllers/supabaseOrderController.js:444-507`  
**Severity:** 🟡 Medium (Feature)

**Issue:**
```javascript
// Try with attachment_url, if fails, retry without it
if (orderError && orderError.message.includes('attachment_url')) {
  // Retry without attachment_url
}
```

**Root Cause:** Database migration not run - column doesn't exist

**Impact:**
- PDF attachments not saved
- Workaround code adds complexity
- User confusion

**Fix:** Run migration: `ALTER TABLE orders ADD COLUMN attachment_url VARCHAR(500);`

---

#### **BUG #10: Inventory Validation Inconsistent**
**Location:** `controllers/supabaseOrderController.js:566-572`  
**Severity:** 🟡 Medium (Data Validation)

**Issue:**
```javascript
if (newAvailableStock < 0) {
  throw new Error(`Insufficient stock...`);
}
```

**Root Cause:** Check happens AFTER inventory fetch but BEFORE update - race condition window

**Impact:**
- Overselling possible under concurrent load
- Negative stock values

**Fix:** Use database constraints or optimistic locking

---

#### **BUG #11: Order Number Format Not Validated**
**Location:** Order creation - no validation  
**Severity:** 🟡 Medium (Data Quality)

**Issue:** Order numbers generated but format not validated or enforced

**Root Cause:** No validation on order_number field

**Impact:**
- Potential duplicates
- Format inconsistencies

**Fix:** Add unique constraint and format validation

---

#### **BUG #12: Financial Calculation Precision**
**Location:** `utils/financialSecurity.js:18-24`  
**Severity:** 🟡 Medium (Financial)

**Issue:**
```javascript
const orderAmount = 2.50 + Math.max(0, units - 1) * 1.25;
total += orderAmount;
return parseFloat(total.toFixed(2));
```

**Root Cause:** Floating point arithmetic can cause rounding errors

**Impact:**
- Penny discrepancies in invoices
- Rounding errors accumulate

**Fix:** Use integer arithmetic (cents) or decimal library

---

### 🟢 LOW SEVERITY BUGS

#### **BUG #13: Error Messages Too Verbose**
**Location:** Multiple controllers  
**Severity:** 🟢 Low (Security)

**Issue:** Error messages expose internal details in production

**Fix:** Already addressed in security middleware

---

#### **BUG #14: Unused Imports**
**Location:** Multiple files  
**Severity:** 🟢 Low (Code Quality)

**Issue:** Imports like `Plus` icon removed from frontend but import remains

**Fix:** Clean up unused imports

---

## 🛠️ FIXES APPLIED

### Fix #1: Remove Debug Logging
**Status:** ⏳ Pending manual cleanup

**Action Required:**
```bash
# Search and remove in these files:
- middleware/supabaseAuth.js
- controllers/supabaseAuthController.js  
- controllers/supabaseOrderController.js
- config/supabaseAdmin.js

# Remove:
const DEBUG_LOG_PATH = ...
fs.appendFileSync(DEBUG_LOG_PATH, ...)
debugLog(...)
```

### Fix #2: Add Status Transition Validation
**Status:** ✅ Ready to implement

**Code Change:**
```javascript
// controllers/supabaseOrderController.js:772
const { validateStatusTransition } = require('../utils/financialSecurity');

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', id)
      .single();
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // VALIDATE STATUS TRANSITION
    try {
      validateStatusTransition(order.status, status);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    // Continue with update...
  }
}
```

### Fix #3: Fix Race Condition in Inventory
**Status:** ✅ Ready to implement

**Code Change:**
```javascript
// Use atomic increment/decrement
const { error: updateError } = await supabaseAdmin
  .rpc('update_inventory_atomic', {
    p_inventory_id: inventory.id,
    p_reserved_delta: -item.quantity,
    p_dispatched_delta: item.quantity
  });
```

**Database Function:**
```sql
CREATE OR REPLACE FUNCTION update_inventory_atomic(
  p_inventory_id UUID,
  p_reserved_delta INTEGER,
  p_dispatched_delta INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory
  SET 
    reserved_stock = reserved_stock + p_reserved_delta,
    dispatched_stock = dispatched_stock + p_dispatched_delta,
    last_updated = NOW(),
    updated_at = NOW()
  WHERE id = p_inventory_id
    AND reserved_stock + p_reserved_delta >= 0; -- Prevent negative
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient reserved stock';
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Fix #4: Add Locking Check to All Order Endpoints
**Status:** ✅ Ready to implement

**Code Change:**
```javascript
// Add to updateOrder, deleteOrder, etc.
const { verifyOrderEditable } = require('../utils/financialSecurity');

exports.updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // CHECK IF LOCKED
    await verifyOrderEditable(id);
    
    // Continue with update...
  }
}
```

### Fix #5: Decide on Cancelled Status
**Status:** ⏳ Pending decision

**Options:**
1. **Add back to frontend** - Allow cancellations for non-invoiced orders
2. **Remove from backend** - Enforce linear workflow only

**Recommendation:** Add back to frontend with restrictions:
- Only allow for pending/approved orders
- Block for packed/dispatched/invoiced orders

### Fix #6: Fix Inventory Rollback
**Status:** ✅ Ready to implement

**Code Change:**
```javascript
// Store original values BEFORE modification
const inventorySnapshots = [];

for (const item of parsedItems) {
  const { data: inventory } = await supabaseAdmin
    .from('inventory')
    .select('*')
    .eq('product_id', item.productId)
    .single();
  
  // Store snapshot
  inventorySnapshots.push({
    id: inventory.id,
    original_available: inventory.available_stock,
    original_reserved: inventory.reserved_stock,
    quantity: item.quantity
  });
  
  // Update inventory...
}

// In rollback:
for (const snapshot of inventorySnapshots) {
  await supabaseAdmin
    .from('inventory')
    .update({
      available_stock: snapshot.original_available,
      reserved_stock: snapshot.original_reserved
    })
    .eq('id', snapshot.id);
}
```

### Fix #7: Complete Invoice Locking Migration
**Status:** ✅ Ready to implement

**Code Change:**
```javascript
// Remove invoiced_in field usage
// Update all checks to use invoice_id only

// Before:
if (order.invoiced_in) { ... }

// After:
if (order.invoice_id) {
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('status')
    .eq('id', order.invoice_id)
    .single();
  
  if (invoice && invoice.status !== 'draft') {
    // Order is locked
  }
}
```

**Database Migration:**
```sql
-- Remove deprecated field
ALTER TABLE orders DROP COLUMN IF EXISTS invoiced_in;
```

### Fix #8: Remove Manual Invoice Generation
**Status:** ✅ Already done in frontend

**Backend Action:** Disable or remove these endpoints:
- `POST /api/invoices/generate`
- `POST /api/invoices/create`

Keep only:
- `POST /api/invoices/generate-monthly-auto` (cron only)

### Fix #9: Run Attachment URL Migration
**Status:** ⏳ Pending manual action

**Migration:**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_orders_attachment_url ON orders(attachment_url);
```

### Fix #10: Add Database Constraints
**Status:** ✅ Ready to implement

**Migrations:**
```sql
-- Prevent negative inventory
ALTER TABLE inventory ADD CONSTRAINT chk_available_stock_positive 
  CHECK (available_stock >= 0);
ALTER TABLE inventory ADD CONSTRAINT chk_reserved_stock_positive 
  CHECK (reserved_stock >= 0);

-- Unique order numbers
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);

-- Invoice amount precision
ALTER TABLE invoices ALTER COLUMN total_amount TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN amount_paid TYPE NUMERIC(10,2);
```

---

## 📋 PRIORITY FIX LIST

### **Immediate (Do Now)**
1. ✅ Remove debug logging (security critical)
2. ✅ Add status transition validation (business logic)
3. ✅ Add locking check to all order endpoints (financial security)

### **This Week**
4. ✅ Fix inventory race condition (data integrity)
5. ✅ Fix inventory rollback logic (error handling)
6. ✅ Complete invoice locking migration (technical debt)
7. ✅ Run attachment URL migration (feature completion)

### **This Month**
8. ✅ Decide on cancelled status (business decision)
9. ✅ Add database constraints (data integrity)
10. ✅ Remove manual invoice endpoints (cleanup)

---

## ✅ VERIFICATION STEPS

### Test Status Transitions
```bash
# Should succeed: pending → approved
curl -X PATCH http://localhost:5000/api/orders/ORDER_ID \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status":"approved"}'

# Should fail: pending → dispatched
curl -X PATCH http://localhost:5000/api/orders/ORDER_ID \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status":"dispatched"}'
```

### Test Invoice Locking
```bash
# Should fail: update invoiced order
curl -X PATCH http://localhost:5000/api/orders/INVOICED_ORDER_ID \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status":"cancelled"}'
```

### Test Inventory Atomicity
```bash
# Concurrent dispatches should not cause negative inventory
# Run 10 simultaneous requests
for i in {1..10}; do
  curl -X PATCH http://localhost:5000/api/orders/ORDER_ID/status \
    -H "Authorization: Bearer TOKEN" \
    -d '{"status":"dispatched"}' &
done
wait

# Check inventory - should never be negative
```

---

## 📊 BUG SUMMARY

| Severity | Count | Fixed | Pending |
|----------|-------|-------|---------|
| 🔴 Critical | 4 | 0 | 4 |
| 🟠 High | 4 | 0 | 4 |
| 🟡 Medium | 4 | 0 | 4 |
| 🟢 Low | 2 | 1 | 1 |
| **Total** | **14** | **1** | **13** |

---

## 🎯 ROOT CAUSES

1. **Incomplete Refactoring** - Frontend changes not reflected in backend
2. **Missing Validation** - Status transitions not enforced
3. **Race Conditions** - No atomic operations for inventory
4. **Security Oversights** - Debug logging in production
5. **Technical Debt** - Dual fields for invoice locking
6. **Missing Migrations** - Database schema incomplete

---

**Next Step:** Implement fixes in priority order, starting with critical security and financial bugs.
