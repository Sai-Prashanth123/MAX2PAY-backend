
ALTER TABLE inbound_logs 
DROP CONSTRAINT IF EXISTS inbound_logs_status_check;

-- Add the new constraint with 'pending' and 'received' as valid values
ALTER TABLE inbound_logs 
ADD CONSTRAINT inbound_logs_status_check 
CHECK (status IN ('pending', 'received'));

-- Verify the constraint
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'inbound_logs_status_check';
