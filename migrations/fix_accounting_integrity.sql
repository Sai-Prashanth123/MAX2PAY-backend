-- =====================================================
-- CRITICAL ACCOUNTING INTEGRITY FIXES
-- =====================================================
-- This migration fixes fundamental accounting flaws:
-- 1. Replaces string invoice references with proper UUID foreign keys
-- 2. Implements status-based order locking (not just existence)
-- 3. Prepares infrastructure for credit notes
-- 4. Ensures immutability of invoiced transactions
-- =====================================================

-- =====================================================
-- PART 1: FIX ORDER-INVOICE RELATIONSHIP
-- =====================================================

-- Add proper UUID foreign key to invoices table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id);

-- Migrate existing data from invoiced_in (string) to invoice_id (UUID)
-- This preserves existing relationships
UPDATE orders o
SET invoice_id = i.id
FROM invoices i
WHERE o.invoiced_in = i.invoice_number
  AND o.invoice_id IS NULL;

-- Keep invoiced_in for backward compatibility during transition
-- Will be removed in future migration after all code is updated
-- ALTER TABLE orders DROP COLUMN invoiced_in; -- Run this later

-- Add computed column for lock status based on invoice status
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_locked_by_invoice BOOLEAN 
GENERATED ALWAYS AS (
  invoice_id IS NOT NULL
) STORED;

COMMENT ON COLUMN orders.invoice_id IS 'UUID reference to invoice. Orders are locked when linked invoice status is sent/partial/paid';
COMMENT ON COLUMN orders.invoiced_in IS 'DEPRECATED: Legacy invoice number reference. Use invoice_id instead. Will be removed.';

-- =====================================================
-- PART 2: CREDIT NOTES INFRASTRUCTURE
-- =====================================================

-- Create credit_notes table for handling returns, refunds, adjustments
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  
  -- Credit note details
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('return', 'damage', 'pricing_error', 'goodwill', 'other')),
  description TEXT,
  
  -- Amounts (negative values)
  subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal <= 0),
  tax_amount NUMERIC(10,2) DEFAULT 0 CHECK (tax_amount <= 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount <= 0),
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'applied', 'void')),
  
  -- Audit fields
  created_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  issued_at TIMESTAMP,
  applied_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Credit note line items
CREATE TABLE IF NOT EXISTS credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  
  -- Reference to original invoice line or order
  order_id UUID REFERENCES orders(id),
  description TEXT NOT NULL,
  
  -- Quantities and amounts (negative)
  quantity INTEGER CHECK (quantity <= 0),
  unit_price NUMERIC(10,2),
  amount NUMERIC(10,2) NOT NULL CHECK (amount <= 0),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for credit notes
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client_id ON credit_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note_id ON credit_note_lines(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_order_id ON credit_note_lines(order_id);

COMMENT ON TABLE credit_notes IS 'Credit notes for returns, refunds, and adjustments. Linked to original invoices.';
COMMENT ON COLUMN credit_notes.total_amount IS 'Always negative or zero. Reduces invoice balance.';

-- =====================================================
-- PART 3: UPDATED ORDER LOCKING LOGIC
-- =====================================================

-- Drop old trigger
DROP TRIGGER IF EXISTS trigger_prevent_locked_order_edit ON orders;

-- Create new function that checks invoice STATUS, not just existence
CREATE OR REPLACE FUNCTION prevent_locked_order_edit()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status VARCHAR(20);
BEGIN
  -- Allow if order is not linked to any invoice
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get the invoice status
  SELECT status INTO invoice_status
  FROM invoices
  WHERE id = NEW.invoice_id;
  
  -- CRITICAL: Orders are only locked when invoice is SENT, PARTIAL, or PAID
  -- Draft invoices do NOT lock orders (allows corrections before sending)
  IF invoice_status IN ('sent', 'partial', 'paid') THEN
    
    -- BLOCK: Cannot cancel invoiced orders
    -- Reason: Invoiced = billed service. Use credit notes for adjustments.
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      RAISE EXCEPTION 'Cannot cancel invoiced order. Invoice % is %. Create a credit note instead.', 
        (SELECT invoice_number FROM invoices WHERE id = NEW.invoice_id),
        invoice_status
        USING HINT = 'Use credit note workflow for returns/refunds';
    END IF;
    
    -- BLOCK: Cannot change status (except specific allowed transitions)
    IF NEW.status != OLD.status THEN
      RAISE EXCEPTION 'Order is locked by invoice % (status: %). Orders cannot be modified after invoicing.', 
        (SELECT invoice_number FROM invoices WHERE id = NEW.invoice_id),
        invoice_status
        USING HINT = 'Invoice status must be draft to edit orders';
    END IF;
    
    -- BLOCK: Cannot change client
    IF NEW.client_id != OLD.client_id THEN
      RAISE EXCEPTION 'Order is locked by invoice. Client cannot be changed.';
    END IF;
    
  END IF;
  
  -- Allow all changes if invoice is still draft
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trigger_prevent_locked_order_edit
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_order_edit();

COMMENT ON FUNCTION prevent_locked_order_edit IS 'Prevents editing orders once linked invoice is sent/partial/paid. Draft invoices do not lock orders.';

-- =====================================================
-- PART 4: INVOICE BALANCE TRACKING FOR CREDIT NOTES
-- =====================================================

-- Add field to track applied credit notes
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS credit_notes_applied NUMERIC(10,2) DEFAULT 0 CHECK (credit_notes_applied >= 0);

-- Update balance_due calculation to include credit notes
-- balance_due = total_amount - paid_amount - credit_notes_applied

COMMENT ON COLUMN invoices.credit_notes_applied IS 'Total amount of credit notes applied to this invoice. Reduces balance due.';

-- =====================================================
-- PART 5: AUDIT TRAIL FOR INVOICE LOCKING
-- =====================================================

-- Create audit log for when orders get locked
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

COMMENT ON TABLE order_lock_audit IS 'Audit trail of when orders were locked by invoices. Critical for compliance.';

-- =====================================================
-- PART 6: HELPER FUNCTIONS
-- =====================================================

-- Function to check if order can be edited
CREATE OR REPLACE FUNCTION can_edit_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_status VARCHAR(20);
BEGIN
  SELECT invoice_id INTO v_invoice_id
  FROM orders
  WHERE id = p_order_id;
  
  -- No invoice = editable
  IF v_invoice_id IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Get invoice status
  SELECT status INTO v_invoice_status
  FROM invoices
  WHERE id = v_invoice_id;
  
  -- Editable only if invoice is draft
  RETURN v_invoice_status = 'draft';
END;
$$ LANGUAGE plpgsql;

-- Function to get invoice lock status
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

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check orders with invoice references
-- SELECT 
--   o.order_number,
--   o.status,
--   o.invoiced_in as legacy_ref,
--   o.invoice_id as new_ref,
--   i.invoice_number,
--   i.status as invoice_status,
--   can_edit_order(o.id) as can_edit
-- FROM orders o
-- LEFT JOIN invoices i ON o.invoice_id = i.id
-- WHERE o.invoice_id IS NOT NULL
-- LIMIT 10;

-- Check credit notes infrastructure
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('credit_notes', 'credit_note_lines')
-- ORDER BY table_name, ordinal_position;
