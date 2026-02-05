-- ============================================
-- MIGRATION: Enhanced Invoice System for USA Compliance
-- ============================================

-- 1. Add billing preference to clients table
DO $$
BEGIN
    -- Add billing preference to clients table
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_preference VARCHAR(20) DEFAULT 'delivery' CHECK (billing_preference IN ('dispatch', 'delivery'));

    -- Add tax region
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_region VARCHAR(50) DEFAULT 'US';

    -- Add tax rate
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 8.00;

    -- Add tax ID (only if it doesn't exist)
    BEGIN
        ALTER TABLE clients ADD COLUMN tax_id VARCHAR(100);
    EXCEPTION
        WHEN duplicate_column THEN NULL;  -- Column already exists, ignore
    END;

    -- Add currency support to clients table
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';
END $$;

-- 4. Add weight handling fields to orders table
ALTER TABLE orders ADD COLUMN weight_category VARCHAR(20) DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN requires_manual_billing BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN billing_status VARCHAR(20) DEFAULT 'pending';

-- 5. Add enhanced invoice tracking
ALTER TABLE invoices ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN exchange_rate DECIMAL(10,6) DEFAULT 1.00;
ALTER TABLE invoices ADD COLUMN tax_region VARCHAR(50) DEFAULT 'US';
ALTER TABLE invoices ADD COLUMN tax_jurisdiction VARCHAR(100);
ALTER TABLE invoices ADD COLUMN order_breakdown JSONB DEFAULT '[]'::jsonb;

-- 6. Add invoice status tracking
ALTER TABLE invoices ADD COLUMN sent_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN viewed_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN payment_terms VARCHAR(100) DEFAULT 'NET 30';

-- 7. Create manual billing orders table for orders > 5lbs
CREATE TABLE IF NOT EXISTS manual_billing_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    billing_type VARCHAR(50) NOT NULL CHECK (billing_type IN ('weight_surcharge', 'manual', 'expedited')),
    base_charge DECIMAL(10,2) NOT NULL,
    per_unit_charge DECIMAL(10,2) DEFAULT 0,
    total_units INTEGER NOT NULL,
    total_charge DECIMAL(10,2) NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create invoice order references table for transparency
CREATE TABLE IF NOT EXISTS invoice_order_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    order_total DECIMAL(10,2) NOT NULL,
    billing_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Add indexes for performance
CREATE INDEX idx_manual_billing_orders_order_id ON manual_billing_orders(order_id);
CREATE INDEX idx_manual_billing_orders_client_id ON manual_billing_orders(client_id);
CREATE INDEX idx_invoice_order_references_invoice_id ON invoice_order_references(invoice_id);
CREATE INDEX idx_invoice_order_references_order_id ON invoice_order_references(order_id);

-- 10. Update existing invoices with default values
UPDATE invoices SET 
    currency = 'USD',
    exchange_rate = 1.00,
    tax_region = 'US',
    payment_terms = 'NET 30'
WHERE currency IS NULL;

COMMIT;
