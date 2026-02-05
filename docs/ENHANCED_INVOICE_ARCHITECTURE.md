# Enhanced Invoice System Architecture

## Overview
Production-ready invoice generation system for USA 3PL operations with weight-based billing, tax compliance, and audit trails.

## Key Features

### 1. Weight-Based Billing Logic
- **Standard Orders (≤5 lbs):** $2.50 + (units - 1) × $1.25
- **Heavyweight Orders (>5 lbs):** $2.50 + $5.00 + (units × $0.50)
- **Automatic categorization** based on order weight
- **Manual billing workflow** for heavyweight orders

### 2. Client Billing Preferences
- **Dispatch Billing:** Bill when orders are dispatched
- **Delivery Billing:** Bill when orders are delivered (default)
- **Tax Configuration:** Per-state tax rates, tax IDs
- **Currency Support:** Multi-currency with USD default

### 3. Enhanced Invoice Transparency
- **Order-level breakdown:** Detailed charges per order
- **Manual billing records:** Separate tracking for heavyweight orders
- **Invoice references:** Link invoices to specific orders
- **Audit logging:** Complete change tracking

### 4. USA Tax Framework
- **State-level tax rates:** Configurable by client
- **Tax jurisdictions:** Support for multi-state operations
- **Zero-tax support:** For tax-exempt clients
- **Tax amount calculation:** Automatic with validation

### 5. Safeguards & Compliance
- **Duplicate prevention:** Multiple checks prevent double billing
- **Order locking:** Prevents invoicing of processed orders
- **Weight validation:** Enforces >5lb heavyweight categorization
- **Audit trails:** Every action logged with user context

## Database Schema Changes

### New Tables
```sql
-- Client billing preferences
ALTER TABLE clients ADD COLUMN billing_preference VARCHAR(20) DEFAULT 'delivery';
ALTER TABLE clients ADD COLUMN tax_region VARCHAR(50) DEFAULT 'US';
ALTER TABLE clients ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 8.00;
ALTER TABLE clients ADD COLUMN tax_id VARCHAR(100);
ALTER TABLE clients ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';

-- Manual billing for heavyweight orders
CREATE TABLE manual_billing_orders (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    client_id UUID REFERENCES clients(id),
    billing_type VARCHAR(50),
    base_charge DECIMAL(10,2),
    per_unit_charge DECIMAL(10,2),
    total_units INTEGER,
    total_charge DECIMAL(10,2),
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoice transparency
CREATE TABLE invoice_order_references (
    id UUID PRIMARY KEY,
    invoice_id UUID REFERENCES invoices(id),
    order_id UUID REFERENCES orders(id),
    order_number VARCHAR(100),
    order_total DECIMAL(10,2),
    billing_amount DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order enhancements
ALTER TABLE orders ADD COLUMN weight_category VARCHAR(20) DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN requires_manual_billing BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN billing_status VARCHAR(20) DEFAULT 'pending';

-- Invoice enhancements
ALTER TABLE invoices ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN exchange_rate DECIMAL(10,6) DEFAULT 1.00;
ALTER TABLE invoices ADD COLUMN tax_region VARCHAR(50) DEFAULT 'US';
ALTER TABLE invoices ADD COLUMN tax_jurisdiction VARCHAR(100);
ALTER TABLE invoices ADD COLUMN order_breakdown JSONB DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN sent_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN viewed_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN payment_terms VARCHAR(100) DEFAULT 'NET 30';
```

## API Endpoints

### Enhanced Invoice Routes
```javascript
POST /api/invoices/generate-monthly-enhanced
GET  /api/invoices/manual-billing-orders
POST /api/invoices/process-manual-billing
GET  /api/invoices/client-billing-preferences/:clientId
PUT  /api/invoices/client-billing-preferences/:clientId
```

## Implementation Steps

### Phase 1: Database Migration
1. Run migration script: `001_enhance_invoice_system.sql`
2. Verify new tables and columns exist
3. Test data integrity with existing orders

### Phase 2: Backend Integration
1. Add enhanced routes to main router
2. Update existing invoice controllers to use new service
3. Test weight categorization logic
4. Validate tax calculations

### Phase 3: Frontend Updates
1. Add billing preference management
2. Show heavyweight order warnings
3. Enhanced invoice breakdown display
4. Manual billing workflow interface

### Phase 4: Testing & Validation
1. Test standard order billing (≤5 lbs)
2. Test heavyweight order handling (>5 lbs)
3. Verify tax calculations by state
4. Test duplicate prevention
5. Validate audit log accuracy

## Usage Examples

### Standard Monthly Invoice
```javascript
// Client with standard orders (≤5 lbs)
const result = await invoiceService.generateMonthlyInvoice(
  'client-uuid',
  12, // December
  2024,
  'user-uuid'
);
// Returns: invoice with standard fulfillment charges
```

### Heavyweight Order Handling
```javascript
// Client with heavyweight orders (>5 lbs)
const result = await invoiceService.generateMonthlyInvoice(
  'client-uuid',
  12,
  2024,
  'user-uuid'
);
// Returns: invoice + manual billing orders created
// Heavyweight orders marked for manual billing
```

### Client Billing Preferences
```javascript
// Set client to bill on delivery
await api.put('/invoices/client-billing-preferences/client-uuid', {
  billingPreference: 'delivery',
  taxRegion: 'CA',
  taxRate: 8.75,
  taxId: 'CA-123456'
});
```

## Validation Checklist

### Pre-Implementation
- [ ] Database backup completed
- [ ] Migration script tested in staging
- [ ] Tax rates verified by state
- [ ] Weight thresholds validated

### Post-Implementation
- [ ] Standard orders bill correctly
- [ ] Heavyweight orders flagged for manual billing
- [ ] Tax calculations accurate by jurisdiction
- [ ] Audit logs capture all changes
- [ ] Invoice transparency maintained
- [ ] No duplicate invoices generated

## Production Deployment

### Configuration
```env
# Enhanced Invoice Settings
ENHANCED_INVOICE_ENABLED=true
WEIGHT_THRESHOLD_LBS=5
STANDARD_BASE_RATE=2.50
STANDARD_ADDITIONAL_UNIT_RATE=1.25
HEAVYWEIGHT_SURCHARGE=5.00
HEAVYWEIGHT_PER_UNIT_RATE=0.50
DEFAULT_TAX_RATE=8.00
DEFAULT_CURRENCY=USD
```

## Monitoring & Alerts

### Key Metrics
- Standard vs heavyweight order ratio
- Manual billing backlog
- Tax calculation accuracy
- Duplicate invoice attempts
- Processing time per invoice

### Alerts
- Heavyweight orders requiring manual billing
- Tax rate configuration errors
- Duplicate invoice prevention triggers
- Audit log anomalies

## Compliance Notes

### USA-Specific Requirements
- **State Tax Support:** Framework supports all 50 states
- **Weight Regulations:** DOT compliance for heavyweight charges
- **Audit Requirements:** SOX-compliant logging
- **Currency Reporting:** USD with multi-currency support
- **Data Retention:** 7-year minimum for audit trails

### International Ready
- **Multi-currency:** Exchange rate support
- **VAT/GST:** Framework for international expansion
- **Localization:** Language and date format support
- **Regulatory:** Configurable compliance rules

This enhanced system provides enterprise-grade invoicing with USA compliance, comprehensive audit trails, and scalable architecture for multi-state 3PL operations.
