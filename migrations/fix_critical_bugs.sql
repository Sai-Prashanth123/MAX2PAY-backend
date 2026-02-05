-- ============================================
-- CRITICAL BUG FIXES - Database Layer
-- ============================================

-- FIX #3: Add atomic inventory update function (prevents race conditions)
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
    AND reserved_stock + p_reserved_delta >= 0  -- Prevent negative reserved
    AND available_stock + p_available_delta >= 0; -- Prevent negative available
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock or inventory not found';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- FIX #10: Add database constraints to prevent invalid data
-- Prevent negative inventory
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

-- Ensure total_stock = available + reserved + dispatched
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_stock_consistency;
ALTER TABLE inventory ADD CONSTRAINT chk_stock_consistency 
  CHECK (total_stock = available_stock + reserved_stock + dispatched_stock);

-- FIX #11: Unique order numbers
ALTER TABLE orders DROP CONSTRAINT IF EXISTS uq_order_number;
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);

-- FIX #12: Invoice amount precision (prevent rounding errors)
ALTER TABLE invoices ALTER COLUMN total_amount TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN amount_paid TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN subtotal TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN tax_amount TYPE NUMERIC(10,2);
ALTER TABLE invoices ALTER COLUMN balance_due TYPE NUMERIC(10,2);

-- FIX #9: Add attachment_url column if missing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_orders_attachment_url ON orders(attachment_url) WHERE attachment_url IS NOT NULL;

-- FIX #7: Remove deprecated invoiced_in field (use invoice_id only)
-- First, ensure all data is migrated to invoice_id
UPDATE orders 
SET invoice_id = (
  SELECT id FROM invoices WHERE invoice_number = orders.invoiced_in
)
WHERE invoiced_in IS NOT NULL AND invoice_id IS NULL;

-- Now safe to drop the column
ALTER TABLE orders DROP COLUMN IF EXISTS invoiced_in;

-- Add index on invoice_id for faster locking checks
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id) WHERE invoice_id IS NOT NULL;

-- Ensure invoice status is valid
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_status;
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status 
  CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void'));

-- Ensure order status is valid
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status 
  CHECK (status IN ('pending', 'approved', 'packed', 'dispatched'));

-- Ensure order priority is valid
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_priority;
ALTER TABLE orders ADD CONSTRAINT chk_order_priority 
  CHECK (priority IN ('low', 'medium', 'high'));

-- Add audit trail for order locking
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

-- Add audit trail for inventory changes
CREATE TABLE IF NOT EXISTS inventory_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL, -- 'reserve', 'dispatch', 'cancel', 'adjust'
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

-- Add trigger to log inventory changes
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

-- Add function to safely cancel order (returns inventory atomically)
CREATE OR REPLACE FUNCTION cancel_order_safe(
  p_order_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Return all reserved stock to available for this order
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
      AND reserved_stock >= v_item.quantity; -- Ensure we have enough reserved
      
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot cancel order: insufficient reserved stock for product %', v_item.product_id;
    END IF;
  END LOOP;
  
  -- Update order status
  UPDATE orders
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check for negative inventory (should return 0 rows)
-- SELECT * FROM inventory WHERE available_stock < 0 OR reserved_stock < 0 OR dispatched_stock < 0;

-- Check for duplicate order numbers (should return 0 rows)
-- SELECT order_number, COUNT(*) FROM orders GROUP BY order_number HAVING COUNT(*) > 1;

-- Check for orders with both old and new invoice fields
-- SELECT id, order_number, invoice_id, invoiced_in FROM orders WHERE invoice_id IS NOT NULL AND invoiced_in IS NOT NULL;

-- Check stock consistency (should return 0 rows)
-- SELECT * FROM inventory WHERE total_stock != (available_stock + reserved_stock + dispatched_stock);

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

-- DROP FUNCTION IF EXISTS update_inventory_atomic(UUID, INTEGER, INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS cancel_order_safe(UUID);
-- DROP FUNCTION IF EXISTS log_inventory_change();
-- DROP TRIGGER IF EXISTS trg_inventory_audit ON inventory;
-- DROP TABLE IF EXISTS inventory_audit;
-- DROP TABLE IF EXISTS order_lock_audit;
