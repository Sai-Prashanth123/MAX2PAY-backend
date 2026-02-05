-- =====================================================
-- FIX ORDER LOCKING TRIGGER
-- =====================================================
-- Fixes the trigger to allow cancellation and remove
-- references to non-existent fields (quantity, product_id)
-- =====================================================

-- Drop the old trigger
DROP TRIGGER IF EXISTS trigger_prevent_locked_order_edit ON orders;

-- Create updated function that allows cancellation
CREATE OR REPLACE FUNCTION prevent_locked_order_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if order is not locked
  IF OLD.invoiced_in IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Allow cancellation for locked orders (for returns/cancellations)
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent all other status changes for locked orders
  IF NEW.status != OLD.status THEN
    RAISE EXCEPTION 'Order is locked because it has been invoiced (%). Only cancellation is allowed.', OLD.invoiced_in;
  END IF;
  
  -- Prevent changes to critical fields
  IF NEW.client_id != OLD.client_id THEN
    RAISE EXCEPTION 'Order is locked because it has been invoiced (%). Client cannot be changed.', OLD.invoiced_in;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trigger_prevent_locked_order_edit
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_order_edit();

-- Verification
-- SELECT order_number, status, invoiced_in, is_locked
-- FROM orders
-- WHERE invoiced_in IS NOT NULL;
