-- =====================================================
-- CRITICAL ACCOUNTING INTEGRITY FIXES (V2)
-- =====================================================
-- Fixed version that drops existing functions first
-- =====================================================

-- =====================================================
-- PART 0: DROP EXISTING FUNCTIONS/TRIGGERS
-- =====================================================

-- Drop existing functions that might conflict
DROP FUNCTION IF EXISTS can_edit_order(UUID);
DROP FUNCTION IF EXISTS get_order_lock_info(UUID);
DROP FUNCTION IF EXISTS prevent_locked_order_edit() CASCADE;

-- =====================================================
-- PART 1: FIX ORDER-INVOICE RELATIONSHIP
-- =====================================================

-- Add proper UUID foreign key to invoices table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id);

-- Migrate existing data from invoiced_in (string) to invoice_id (UUID)
UPDATE orders o
SET invoice_id = i.id
FROM invoices i
WHERE o.invoiced_in = i.invoice_number
  AND o.invoice_id IS NULL;

-- Add computed column for lock status
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_locked_by_invoice BOOLEAN 
GENERATED ALWAYS AS (invoice_id IS NOT NULL) STORED;

COMMENT ON COLUMN orders.invoice_id IS 'UUID reference to invoice. Orders are locked when linked invoice status is sent/partial/paid';
COMMENT ON COLUMN orders.invoiced_in IS 'DEPRECATED: Legacy invoice number reference. Use invoice_id instead.';

-- =====================================================
-- PART 2: CREDIT NOTES INFRASTRUCTURE
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('return', 'damage', 'pricing_error', 'goodwill', 'other')),
  description TEXT,
  
  subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal <= 0),
  tax_amount NUMERIC(10,2) DEFAULT 0 CHECK (tax_amount <= 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount <= 0),
  
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'applied', 'void')),
  
  created_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  issued_at TIMESTAMP,
  applied_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  description TEXT NOT NULL,
  quantity INTEGER CHECK (quantity <= 0),
  unit_price NUMERIC(10,2),
  amount NUMERIC(10,2) NOT NULL CHECK (amount <= 0),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client_id ON credit_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note_id ON credit_note_lines(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_order_id ON credit_note_lines(order_id);

-- =====================================================
-- PART 3: UPDATED ORDER LOCKING LOGIC
-- =====================================================

CREATE OR REPLACE FUNCTION prevent_locked_order_edit()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status VARCHAR(20);
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  SELECT status INTO invoice_status
  FROM invoices
  WHERE id = NEW.invoice_id;
  
  IF invoice_status IN ('sent', 'partial', 'paid') THEN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      RAISE EXCEPTION 'Cannot cancel invoiced order. Invoice % is %. Create a credit note instead.', 
        (SELECT invoice_number FROM invoices WHERE id = NEW.invoice_id),
        invoice_status
        USING HINT = 'Use credit note workflow for returns/refunds';
    END IF;
    
    IF NEW.status != OLD.status THEN
      RAISE EXCEPTION 'Order is locked by invoice % (status: %). Orders cannot be modified after invoicing.', 
        (SELECT invoice_number FROM invoices WHERE id = NEW.invoice_id),
        invoice_status
        USING HINT = 'Invoice status must be draft to edit orders';
    END IF;
    
    IF NEW.client_id != OLD.client_id THEN
      RAISE EXCEPTION 'Order is locked by invoice. Client cannot be changed.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_locked_order_edit
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_order_edit();

-- =====================================================
-- PART 4: INVOICE BALANCE TRACKING
-- =====================================================

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS credit_notes_applied NUMERIC(10,2) DEFAULT 0 CHECK (credit_notes_applied >= 0);

COMMENT ON COLUMN invoices.credit_notes_applied IS 'Total amount of credit notes applied to this invoice.';

-- =====================================================
-- PART 5: AUDIT TRAIL
-- =====================================================

CREATE TABLE IF NOT EXISTS order_lock_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  locked_at TIMESTAMP DEFAULT NOW(),
  locked_by UUID REFERENCES user_profiles(id),
  invoice_status VARCHAR(20) NOT NULL,
  UNIQUE(order_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_order_lock_audit_order_id ON order_lock_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lock_audit_invoice_id ON order_lock_audit(invoice_id);

-- =====================================================
-- PART 6: HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION can_edit_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_status VARCHAR(20);
BEGIN
  SELECT invoice_id INTO v_invoice_id
  FROM orders
  WHERE id = p_order_id;
  
  IF v_invoice_id IS NULL THEN
    RETURN TRUE;
  END IF;
  
  SELECT status INTO v_invoice_status
  FROM invoices
  WHERE id = v_invoice_id;
  
  RETURN v_invoice_status = 'draft';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_order_lock_info(p_order_id UUID)
RETURNS TABLE(
  is_locked BOOLEAN,
  invoice_id UUID,
  invoice_number VARCHAR(50),
  invoice_status VARCHAR(20),
  locked_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.status IN ('sent', 'partial', 'paid') as is_locked,
    i.id as invoice_id,
    i.invoice_number,
    i.status as invoice_status,
    CASE 
      WHEN i.status IN ('sent', 'partial', 'paid') THEN 
        'Order locked by invoice ' || i.invoice_number || ' (status: ' || i.status || ')'
      ELSE 
        'Order editable (invoice is draft)'
    END as locked_reason
  FROM orders o
  LEFT JOIN invoices i ON o.invoice_id = i.id
  WHERE o.id = p_order_id;
END;
$$ LANGUAGE plpgsql;
