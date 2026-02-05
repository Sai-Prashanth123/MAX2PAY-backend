-- ============================================
-- Quick Fix: Drop "name" Column from Clients Table
-- ============================================
-- This is a simpler version that just removes the problematic "name" column
-- Run this if you're getting: "null value in column "name" violates not-null constraint"
-- ============================================

-- First, make sure company_name has values (copy from name if needed)
UPDATE clients 
SET company_name = COALESCE(company_name, name, 'Unknown')
WHERE company_name IS NULL OR company_name = '';

-- Now drop the "name" column if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'name'
    ) THEN
        -- Remove NOT NULL constraint first if it exists
        BEGIN
            ALTER TABLE clients ALTER COLUMN name DROP NOT NULL;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore if constraint doesn't exist or other errors
            NULL;
        END;
        
        -- Drop the column
        ALTER TABLE clients DROP COLUMN name;
        RAISE NOTICE '✅ Successfully dropped "name" column from clients table';
    ELSE
        RAISE NOTICE 'ℹ️  "name" column does not exist - no action needed';
    END IF;
END $$;

-- Verify the fix
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'clients' 
    AND column_name IN ('name', 'company_name', 'contact_person')
ORDER BY column_name;
