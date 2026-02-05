-- ============================================
-- CRITICAL BUG FIXES - Database Layer (v3)
-- Fixed: Handles existing triggers and constraints
-- ============================================

-- STEP 1: Fix existing inconsistent inventory data BEFORE adding constraints
UPDATE inventory
SET total_stock = available_stock + reserved_stock + dispatched_stock
WHERE total_stock != (available_stock + reserved_stock + dispatched_stock);

-- STEP 2: Fix any negative values
UPDATE inventory SET available_stock = 0 WHERE available_stock < 0;
UPDATE inventory SET reserved_stock = 0 WHERE reserved_stock < 0;
UPDATE inventory SET dispatched_stock = 0 WHERE dispatched_stock < 0;
UPDATE inventory SET total_stock = 0 WHERE total_stock < 0;

-- Recalculate total_stock after fixing negatives
UPDATE inventory
SET total_stock = available_stock + reserved_stock + dispatched_stock;

-- STEP 3: Drop existing triggers that depend on invoice columns
DROP TRIGGER IF EXISTS trigger_update_invoice_balance ON invoices;
DROP TRIGGER IF EXISTS trigger_update_invoice_status ON invoices;
DROP TRIGGER IF EXISTS trigger_check_invoice_amount ON invoices;

-- STEP 4: Now safe to alter column types
-- FIX #12: Invoice amount precision (prevent rounding errors)
ALTER TABLE invoices ALTER COLUMN total_amount TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN amount_paid TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN subtotal TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN tax_amount TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN balance_due TYPE NUMERIC(10,2);

-- STEP 5: Recreate the balance trigger (if it was needed)
CREATE OR REPLACE FUNCTION update_invoice_balance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.balance_due = NEW.total_amount - COALESCE(NEW.amount_paid, 0);
  
  -- Update status based on payment
  IF NEW.balance_due <= 0 THEN
    NEW.status = 'paid';
  ELSIF NEW.amount_paid > 0 AND NEW.balance_due > 0 THEN
    NEW.status = 'partial';
  ELSIF NEW.balance_due > 0 AND NEW.due_date < CURRENT_DATE THEN
    NEW.status = 'overdue';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_balance
  BEFORE INSERT OR UPDATE OF total_amount, amount_paid
  ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_balance();

-- STEP 6: Add atomic inventory update function (prevents race conditions)
CREATE OR REPLACE FUNCTION update_inventory_atomic(
  p_inventory_id UUID,
  p_reserved_delta INTEGER,
  p_dispatched_delta INTEGER DEFAULT 0,
  p_available_delta INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory
  SET 
    reserved_stock = reserved_stock + p_reserved_delta,
    dispatched_stock = dispatched_stock + p_dispatched_delta,
    available_stock = available_stock + p_available_delta,
    last_updated = NOW(),
    updated_at = NOW()
  WHERE id = p_inventory_id
    AND reserved_stock + p_reserved_delta >= 0
    AND available_stock + p_available_delta >= 0;
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock or inventory not found';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- STEP 7: Add database constraints
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_available_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_available_stock_positive 
  CHECK (available_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_reserved_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_reserved_stock_positive 
  CHECK (reserved_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_dispatched_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_dispatched_stock_positive 
  CHECK (dispatched_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_total_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_total_stock_positive 
  CHECK (total_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_stock_consistency;
ALTER TABLE inventory ADD CONSTRAINT chk_stock_consistency 
  CHECK (total_stock = available_stock + reserved_stock + dispatched_stock);

-- FIX #11: Unique order numbers
ALTER TABLE orders DROP CONSTRAINT IF EXISTS uq_order_number;
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);

-- FIX #9: Add attachment_url column if missing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_orders_attachment_url ON orders(attachment_url) WHERE attachment_url IS NOT NULL;

-- FIX #7: Remove deprecated invoiced_in field
UPDATE orders 
SET invoice_id = (
  SELECT id FROM invoices WHERE invoice_number = orders.invoiced_in
)
WHERE invoiced_in IS NOT NULL AND invoice_id IS NULL;

ALTER TABLE orders DROP COLUMN IF EXISTS invoiced_in;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id) WHERE invoice_id IS NOT NULL;

-- Ensure valid statuses
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_status;
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status 
  CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status 
  CHECK (status IN ('pending', 'approved', 'packed', 'dispatched'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_priority;
ALTER TABLE orders ADD CONSTRAINT chk_order_priority 
  CHECK (priority IN ('low', 'medium', 'high'));

-- Add audit tables
CREATE TABLE IF NOT EXISTS order_lock_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  locked_by UUID REFERENCES user_profiles(id),
  invoice_status VARCHAR(20),
  locked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_lock_audit_order_id ON order_lock_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lock_audit_invoice_id ON order_lock_audit(invoice_id);

CREATE TABLE IF NOT EXISTS inventory_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  quantity_change INTEGER NOT NULL,
  available_before INTEGER,
  reserved_before INTEGER,
  dispatched_before INTEGER,
  available_after INTEGER,
  reserved_after INTEGER,
  dispatched_after INTEGER,
  changed_by UUID REFERENCES user_profiles(id),
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_inventory_id ON inventory_audit(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_order_id ON inventory_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_changed_at ON inventory_audit(changed_at);

-- Inventory audit trigger
CREATE OR REPLACE FUNCTION log_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory_audit (
    inventory_id,
    action,
    quantity_change,
    available_before,
    reserved_before,
    dispatched_before,
    available_after,
    reserved_after,
    dispatched_after
  ) VALUES (
    NEW.id,
    'update',
    COALESCE(NEW.available_stock - OLD.available_stock, 0) + 
    COALESCE(NEW.reserved_stock - OLD.reserved_stock, 0) + 
    COALESCE(NEW.dispatched_stock - OLD.dispatched_stock, 0),
    OLD.available_stock,
    OLD.reserved_stock,
    OLD.dispatched_stock,
    NEW.available_stock,
    NEW.reserved_stock,
    NEW.dispatched_stock
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_audit ON inventory;
CREATE TRIGGER trg_inventory_audit
  AFTER UPDATE ON inventory
  FOR EACH ROW
  WHEN (
    OLD.available_stock IS DISTINCT FROM NEW.available_stock OR
    OLD.reserved_stock IS DISTINCT FROM NEW.reserved_stock OR
    OLD.dispatched_stock IS DISTINCT FROM NEW.dispatched_stock
  )
  EXECUTE FUNCTION log_inventory_change();

-- Safe order cancellation function
CREATE OR REPLACE FUNCTION cancel_order_safe(
  p_order_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_item RECORD;
BEGIN
  FOR v_item IN 
    SELECT oi.product_id, oi.quantity, o.client_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_order_id
  LOOP
    UPDATE inventory
    SET 
      available_stock = available_stock + v_item.quantity,
      reserved_stock = reserved_stock - v_item.quantity,
      last_updated = NOW(),
      updated_at = NOW()
    WHERE product_id = v_item.product_id
      AND client_id = v_item.client_id
      AND reserved_stock >= v_item.quantity;
      
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot cancel order: insufficient reserved stock for product %', v_item.product_id;
    END IF;
  END LOOP;
  
  UPDATE orders
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 
  'Migration completed successfully' as status,
  (SELECT COUNT(*) FROM inventory WHERE available_stock < 0 OR reserved_stock < 0 OR dispatched_stock < 0) as negative_inventory_count,
  (SELECT COUNT(*) FROM (SELECT order_number, COUNT(*) FROM orders GROUP BY order_number HAVING COUNT(*) > 1) d) as duplicate_orders_count,
  (SELECT COUNT(*) FROM inventory WHERE total_stock != (available_stock + reserved_stock + dispatched_stock)) as inconsistent_stock_count;
