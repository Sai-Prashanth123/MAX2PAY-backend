-- ============================================
-- Fix: Ensure Clients Table Has Required Columns
-- ============================================
-- Run this in Supabase SQL Editor to add missing columns
-- This will only add columns that don't exist (safe to re-run)
-- ============================================

DO $$ 
BEGIN
    -- Ensure company_name column exists (should be there, but just in case)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'company_name'
    ) THEN
        -- Check if table exists first
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'clients'
        ) THEN
            ALTER TABLE clients ADD COLUMN company_name VARCHAR(255);
            
            -- If old data exists, you might need to populate it
            -- UPDATE clients SET company_name = 'Unknown' WHERE company_name IS NULL;
            
            RAISE NOTICE 'Added company_name column to clients table';
        ELSE
            RAISE EXCEPTION 'clients table does not exist. Please run supabase-schema.sql first.';
        END IF;
    ELSE
        RAISE NOTICE 'company_name column already exists';
    END IF;

    -- Ensure contact_person column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'contact_person'
    ) THEN
        ALTER TABLE clients ADD COLUMN contact_person VARCHAR(255);
        RAISE NOTICE 'Added contact_person column to clients table';
    END IF;

    -- Ensure email column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'email'
    ) THEN
        ALTER TABLE clients ADD COLUMN email VARCHAR(255);
        RAISE NOTICE 'Added email column to clients table';
    END IF;

    -- Ensure phone column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'phone'
    ) THEN
        ALTER TABLE clients ADD COLUMN phone VARCHAR(50);
        RAISE NOTICE 'Added phone column to clients table';
    END IF;

    -- Ensure is_active column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE clients ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column to clients table';
    END IF;

    -- Ensure notes column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE clients ADD COLUMN notes TEXT;
        RAISE NOTICE 'Added notes column to clients table';
    END IF;

    -- Ensure tax_id column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'tax_id'
    ) THEN
        ALTER TABLE clients ADD COLUMN tax_id VARCHAR(100);
        RAISE NOTICE 'Added tax_id column to clients table';
    END IF;

    -- Ensure created_at column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE clients ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to clients table';
    END IF;

    -- Ensure updated_at column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE clients ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to clients table';
    END IF;

END $$;

-- Verify all columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'clients' 
ORDER BY ordinal_position;

-- Refresh the schema cache by running a simple query
SELECT COUNT(*) FROM clients LIMIT 1;
