-- =====================================================
-- PARTIAL PAYMENT SUPPORT FOR INVOICES
-- =====================================================
-- This migration adds support for tracking multiple payments
-- against a single invoice, preventing revenue leakage
-- =====================================================

-- 1. Add paid_amount column to invoices table
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- 2. Update existing invoices to set paid_amount
-- For invoices marked as 'paid', set paid_amount = total_amount
UPDATE invoices
SET paid_amount = total_amount
WHERE status = 'paid';

-- 3. Add constraint: paid_amount cannot exceed total_amount
ALTER TABLE invoices
ADD CONSTRAINT check_paid_amount_not_exceeds_total
CHECK (paid_amount <= total_amount);

-- 4. Add constraint: paid_amount cannot be negative
ALTER TABLE invoices
ADD CONSTRAINT check_paid_amount_positive
CHECK (paid_amount >= 0);

-- 5. Update status enum to include 'partial'
-- Note: In Supabase, you may need to do this manually in the dashboard
-- or use ALTER TYPE if status is a custom enum type
-- For now, we'll handle this in application logic

-- 6. Create invoice_payments table for payment history
CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id 
ON invoice_payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_date 
ON invoice_payments(payment_date);

-- 8. Add RLS (Row Level Security) policies for invoice_payments
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage all payments"
ON invoice_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Clients can view their own invoice payments
CREATE POLICY "Clients can view their invoice payments"
ON invoice_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM invoices
    JOIN user_profiles ON user_profiles.client_id = invoices.client_id
    WHERE invoices.id = invoice_payments.invoice_id
    AND user_profiles.id = auth.uid()
    AND user_profiles.role = 'client'
  )
);

-- 9. Create function to automatically update balance_due
CREATE OR REPLACE FUNCTION update_invoice_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate balance_due based on paid_amount
  NEW.balance_due = NEW.total_amount - NEW.paid_amount;
  
  -- Auto-update status based on payment
  IF NEW.balance_due <= 0 THEN
    NEW.status = 'paid';
    IF NEW.paid_date IS NULL THEN
      NEW.paid_date = CURRENT_DATE;
    END IF;
  ELSIF NEW.paid_amount > 0 AND NEW.balance_due > 0 THEN
    NEW.status = 'partial';
  ELSIF NEW.paid_amount = 0 THEN
    -- Keep existing status if no payment made
    IF NEW.status = 'paid' OR NEW.status = 'partial' THEN
      NEW.status = 'sent';
    END IF;
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger to auto-update balance and status
DROP TRIGGER IF EXISTS trigger_update_invoice_balance ON invoices;
CREATE TRIGGER trigger_update_invoice_balance
BEFORE UPDATE OF paid_amount, total_amount ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_invoice_balance();

-- 11. Add helpful comments
COMMENT ON COLUMN invoices.paid_amount IS 'Total amount paid so far (sum of all payments)';
COMMENT ON COLUMN invoices.balance_due IS 'Remaining amount to be paid (total_amount - paid_amount)';
COMMENT ON TABLE invoice_payments IS 'Tracks individual payment transactions against invoices';

-- =====================================================
-- VERIFICATION QUERIES (Run these to verify)
-- =====================================================

-- Check invoices table structure
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'invoices' 
-- AND column_name IN ('paid_amount', 'balance_due', 'status');

-- Check invoice_payments table
-- SELECT * FROM invoice_payments LIMIT 1;

-- Test payment calculation
-- SELECT 
--   invoice_number,
--   total_amount,
--   paid_amount,
--   balance_due,
--   status
-- FROM invoices
-- WHERE status IN ('paid', 'partial')
-- LIMIT 5;
