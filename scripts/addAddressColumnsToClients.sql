-- ============================================
-- Migration: Add Address Columns to Clients Table
-- ============================================
-- This script adds the missing address columns to the existing clients table
-- Run this in Supabase SQL Editor if you get "address_city column not found" errors
-- ============================================

-- Add address columns if they don't exist
DO $$ 
BEGIN
    -- Add address_street if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'address_street'
    ) THEN
        ALTER TABLE clients ADD COLUMN address_street TEXT;
    END IF;

    -- Add address_city if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'address_city'
    ) THEN
        ALTER TABLE clients ADD COLUMN address_city VARCHAR(100);
    END IF;

    -- Add address_state if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'address_state'
    ) THEN
        ALTER TABLE clients ADD COLUMN address_state VARCHAR(100);
    END IF;

    -- Add address_zip_code if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'address_zip_code'
    ) THEN
        ALTER TABLE clients ADD COLUMN address_zip_code VARCHAR(20);
    END IF;

    -- Add address_country if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'address_country'
    ) THEN
        ALTER TABLE clients ADD COLUMN address_country VARCHAR(100) DEFAULT 'United States';
    END IF;
END $$;

-- Verify columns were added
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'clients' 
    AND column_name LIKE 'address%'
ORDER BY column_name;
