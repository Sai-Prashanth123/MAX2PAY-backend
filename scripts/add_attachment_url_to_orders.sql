-- Add attachment_url column to orders table
-- This allows storing the path to PDF files uploaded by clients

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500);

-- Add index for faster queries if needed
CREATE INDEX IF NOT EXISTS idx_orders_attachment_url ON orders(attachment_url) WHERE attachment_url IS NOT NULL;
