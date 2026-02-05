-- ============================================
-- Quick Fix: Add tax_id column to clients table
-- ============================================
-- Run this in Supabase SQL Editor to fix the schema cache error
-- ============================================

-- Add tax_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'tax_id'
    ) THEN
        ALTER TABLE clients ADD COLUMN tax_id VARCHAR(100);
        RAISE NOTICE 'Added tax_id column to clients table';
    ELSE
        RAISE NOTICE 'tax_id column already exists';
    END IF;
END $$;

-- Refresh schema cache by querying the table
SELECT COUNT(*) FROM clients LIMIT 1;
