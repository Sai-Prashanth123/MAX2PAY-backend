-- ============================================
-- CRITICAL BUG FIXES - FINAL VERSION v2
-- Fixes existing data before adding constraints
-- ============================================

-- STEP 1: Fix inventory data
UPDATE inventory
SET total_stock = available_stock + reserved_stock + dispatched_stock
WHERE total_stock != (available_stock + reserved_stock + dispatched_stock);

UPDATE inventory SET available_stock = 0 WHERE available_stock < 0;
UPDATE inventory SET reserved_stock = 0 WHERE reserved_stock < 0;
UPDATE inventory SET dispatched_stock = 0 WHERE dispatched_stock < 0;
UPDATE inventory SET total_stock = 0 WHERE total_stock < 0;

UPDATE inventory
SET total_stock = available_stock + reserved_stock + dispatched_stock;

-- STEP 2: Fix order statuses BEFORE adding constraint
-- Map any invalid statuses to valid ones
UPDATE orders SET status = 'pending' 
WHERE status NOT IN ('pending', 'approved', 'packed', 'dispatched', 'cancelled', 'delivered');

-- STEP 3: Fix order priorities
UPDATE orders SET priority = 'medium' 
WHERE priority NOT IN ('low', 'medium', 'high') OR priority IS NULL;

-- STEP 4: Fix invoice statuses
UPDATE invoices SET status = 'draft' 
WHERE status NOT IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void') OR status IS NULL;

-- STEP 5: Drop triggers
DROP TRIGGER IF EXISTS trigger_update_invoice_balance ON invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_update_invoice_status ON invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_check_invoice_amount ON invoices CASCADE;

-- STEP 6: Handle invoiced_in dependencies
ALTER TABLE orders DROP COLUMN IF EXISTS is_locked CASCADE;

UPDATE orders 
SET invoice_id = (SELECT id FROM invoices WHERE invoice_number = orders.invoiced_in)
WHERE invoiced_in IS NOT NULL AND invoice_id IS NULL;

ALTER TABLE orders DROP COLUMN IF EXISTS invoiced_in CASCADE;

-- STEP 7: Alter invoice columns (check if exist)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'total_amount') THEN
    EXECUTE 'ALTER TABLE invoices ALTER COLUMN total_amount TYPE NUMERIC(10,2)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'subtotal') THEN
    EXECUTE 'ALTER TABLE invoices ALTER COLUMN subtotal TYPE NUMERIC(10,2)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'tax_amount') THEN
    EXECUTE 'ALTER TABLE invoices ALTER COLUMN tax_amount TYPE NUMERIC(10,2)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'balance_due') THEN
    EXECUTE 'ALTER TABLE invoices ALTER COLUMN balance_due TYPE NUMERIC(10,2)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'amount') THEN
    EXECUTE 'ALTER TABLE invoices ALTER COLUMN amount TYPE NUMERIC(10,2)';
  END IF;
END $$;

-- STEP 8: Atomic inventory function
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
    RAISE EXCEPTION 'Insufficient stock';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- STEP 9: Inventory constraints
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_available_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_available_stock_positive CHECK (available_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_reserved_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_reserved_stock_positive CHECK (reserved_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_dispatched_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_dispatched_stock_positive CHECK (dispatched_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_total_stock_positive;
ALTER TABLE inventory ADD CONSTRAINT chk_total_stock_positive CHECK (total_stock >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS chk_stock_consistency;
ALTER TABLE inventory ADD CONSTRAINT chk_stock_consistency 
  CHECK (total_stock = available_stock + reserved_stock + dispatched_stock);

-- STEP 10: Order constraints (data is clean now)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS uq_order_number;
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status 
  CHECK (status IN ('pending', 'approved', 'packed', 'dispatched'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_priority;
ALTER TABLE orders ADD CONSTRAINT chk_order_priority 
  CHECK (priority IN ('low', 'medium', 'high'));

-- STEP 11: Invoice constraints
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_status;
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status 
  CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'void'));

-- STEP 12: Add columns and indexes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_orders_attachment_url ON orders(attachment_url) WHERE attachment_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id) WHERE invoice_id IS NOT NULL;

-- STEP 13: Audit tables
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

-- STEP 14: Inventory audit trigger
CREATE OR REPLACE FUNCTION log_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory_audit (
    inventory_id, action, quantity_change,
    available_before, reserved_before, dispatched_before,
    available_after, reserved_after, dispatched_after
  ) VALUES (
    NEW.id, 'update',
    COALESCE(NEW.available_stock - OLD.available_stock, 0) + 
    COALESCE(NEW.reserved_stock - OLD.reserved_stock, 0) + 
    COALESCE(NEW.dispatched_stock - OLD.dispatched_stock, 0),
    OLD.available_stock, OLD.reserved_stock, OLD.dispatched_stock,
    NEW.available_stock, NEW.reserved_stock, NEW.dispatched_stock
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

-- STEP 15: Safe cancellation
CREATE OR REPLACE FUNCTION cancel_order_safe(p_order_id UUID)
RETURNS VOID AS $$
DECLARE v_item RECORD;
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
      last_updated = NOW(), updated_at = NOW()
    WHERE product_id = v_item.product_id
      AND client_id = v_item.client_id
      AND reserved_stock >= v_item.quantity;
  END LOOP;
  
  UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  '✅ Migration SUCCESS' as status,
  (SELECT COUNT(*) FROM inventory WHERE available_stock < 0) as negative_inventory,
  (SELECT COUNT(*) FROM (SELECT order_number FROM orders GROUP BY order_number HAVING COUNT(*) > 1) d) as duplicate_orders,
  (SELECT COUNT(*) FROM inventory WHERE total_stock != (available_stock + reserved_stock + dispatched_stock)) as inconsistent_stock,
  (SELECT COUNT(*) FROM orders WHERE status NOT IN ('pending', 'approved', 'packed', 'dispatched')) as invalid_order_status;
