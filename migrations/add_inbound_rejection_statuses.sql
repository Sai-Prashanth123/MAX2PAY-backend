-- Add new statuses for inbound shipments: rejected, returned, damaged, partial
-- This allows handling of quality issues and returns to client

ALTER TABLE inbound_logs 
DROP CONSTRAINT IF EXISTS inbound_logs_status_check;

-- Add the new constraint with expanded status values
ALTER TABLE inbound_logs 
ADD CONSTRAINT inbound_logs_status_check 
CHECK (status IN ('pending', 'received', 'rejected', 'returned', 'damaged', 'partial'));

-- Add columns for rejection/return tracking
ALTER TABLE inbound_logs 
ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS accepted_quantity INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN inbound_logs.rejected_quantity IS 'Quantity rejected due to quality issues or damage';
COMMENT ON COLUMN inbound_logs.rejection_reason IS 'Reason for rejection or return to client';
COMMENT ON COLUMN inbound_logs.accepted_quantity IS 'Quantity actually accepted into inventory (may differ from original quantity)';

-- Verify the constraint
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'inbound_logs_status_check';
