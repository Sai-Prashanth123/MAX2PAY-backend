-- ============================================
-- Fix: Remove or Rename "name" Column in Clients Table
-- ============================================
-- This fixes the error: "null value in column "name" violates not-null constraint"
-- The clients table should use "company_name" and "contact_person", not "name"
-- ============================================

DO $$ 
BEGIN
    -- Check if "name" column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'name'
    ) THEN
        -- Check if company_name exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'clients' 
            AND column_name = 'company_name'
        ) THEN
            -- Both exist - migrate data from "name" to "company_name" if needed, then drop "name"
            -- First, update any NULL company_name values from name column
            UPDATE clients 
            SET company_name = name 
            WHERE company_name IS NULL AND name IS NOT NULL;
            
            -- Drop the "name" column
            ALTER TABLE clients DROP COLUMN name;
            RAISE NOTICE 'Dropped "name" column from clients table (data migrated to company_name)';
        ELSE
            -- Only "name" exists - rename it to "company_name"
            ALTER TABLE clients RENAME COLUMN name TO company_name;
            RAISE NOTICE 'Renamed "name" column to "company_name" in clients table';
        END IF;
    ELSE
        RAISE NOTICE '"name" column does not exist - no action needed';
    END IF;

    -- Ensure company_name column exists and is NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'company_name'
    ) THEN
        ALTER TABLE clients ADD COLUMN company_name VARCHAR(255) NOT NULL DEFAULT '';
        RAISE NOTICE 'Added company_name column to clients table';
    ELSE
        -- Ensure it's NOT NULL
        ALTER TABLE clients ALTER COLUMN company_name SET NOT NULL;
        RAISE NOTICE 'Ensured company_name is NOT NULL';
    END IF;

    -- Ensure contact_person column exists and is NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'contact_person'
    ) THEN
        ALTER TABLE clients ADD COLUMN contact_person VARCHAR(255) NOT NULL DEFAULT '';
        RAISE NOTICE 'Added contact_person column to clients table';
    ELSE
        -- Ensure it's NOT NULL
        ALTER TABLE clients ALTER COLUMN contact_person SET NOT NULL;
        RAISE NOTICE 'Ensured contact_person is NOT NULL';
    END IF;

END $$;

-- Verify the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'clients' 
ORDER BY ordinal_position;

-- Refresh schema cache
SELECT COUNT(*) FROM clients LIMIT 1;
