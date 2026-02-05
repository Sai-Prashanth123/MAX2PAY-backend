-- =====================================================
-- ORDER LOCKING SYSTEM
-- =====================================================
-- Prevents editing orders once they are included in an invoice
-- Ensures data integrity and prevents accounting inconsistencies
-- =====================================================

-- 1. Add invoiced_in column to track which invoice includes this order
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoiced_in VARCHAR(50);

-- 2. Add index for faster invoice lookups
CREATE INDEX IF NOT EXISTS idx_orders_invoiced_in 
ON orders(invoiced_in);

-- 3. Add is_locked computed column (optional, for clarity)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN GENERATED ALWAYS AS (invoiced_in IS NOT NULL) STORED;

-- 4. Create function to check if order can be edited
CREATE OR REPLACE FUNCTION can_edit_order(order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  order_invoiced_in VARCHAR(50);
BEGIN
  SELECT invoiced_in INTO order_invoiced_in
  FROM orders
  WHERE id = order_id;
  
  -- Order can be edited if it's not invoiced
  RETURN order_invoiced_in IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to prevent editing locked orders
CREATE OR REPLACE FUNCTION prevent_locked_order_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if order is not locked
  IF OLD.invoiced_in IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Allow only specific transitions for locked orders
  -- dispatched → delivered is allowed
  IF OLD.status = 'dispatched' AND NEW.status = 'delivered' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent all other changes to locked orders
  IF NEW.status != OLD.status OR
     NEW.quantity != OLD.quantity OR
     NEW.client_id != OLD.client_id OR
     NEW.product_id != OLD.product_id THEN
    RAISE EXCEPTION 'Order is locked because it has been invoiced (%). Only dispatched→delivered transition allowed.', OLD.invoiced_in;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger
DROP TRIGGER IF EXISTS trigger_prevent_locked_order_edit ON orders;
CREATE TRIGGER trigger_prevent_locked_order_edit
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_order_edit();

-- 7. Add helpful comments
COMMENT ON COLUMN orders.invoiced_in IS 'Invoice number that includes this order. Once set, order becomes read-only.';
COMMENT ON COLUMN orders.is_locked IS 'Computed: TRUE if order is included in an invoice and cannot be edited';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check orders table structure
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'orders' 
-- AND column_name IN ('invoiced_in', 'is_locked');

-- Check locked orders
-- SELECT order_number, status, invoiced_in, is_locked
-- FROM orders
-- WHERE invoiced_in IS NOT NULL;

-- Test locking function
-- SELECT order_number, can_edit_order(id) as can_edit
-- FROM orders
-- LIMIT 5;
