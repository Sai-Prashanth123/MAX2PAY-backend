-- ============================================
-- Diagnostic: Check Clients Table Schema
-- ============================================
-- Run this in Supabase SQL Editor to verify the clients table structure
-- ============================================

-- Check if table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'clients'
) AS table_exists;

-- List all columns in clients table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'clients'
ORDER BY ordinal_position;

-- Check specifically for company_name column
SELECT EXISTS (
   SELECT 1 FROM information_schema.columns 
   WHERE table_schema = 'public' 
   AND table_name = 'clients' 
   AND column_name = 'company_name'
) AS company_name_column_exists;

-- If company_name doesn't exist, check for similar columns
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name = 'clients' 
    AND (column_name LIKE '%company%' OR column_name LIKE '%name%')
ORDER BY column_name;
