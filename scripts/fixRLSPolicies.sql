-- ============================================
-- Fix RLS Policies for Clients Table
-- ============================================
-- Run this in Supabase SQL Editor to fix the RLS error
-- ============================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can manage clients" ON clients;
DROP POLICY IF EXISTS "Clients can view own client" ON clients;
DROP POLICY IF EXISTS "Service role full access" ON clients;

-- Create policy for service role (backend operations bypass RLS)
-- This allows the backend to perform all operations using service role key
CREATE POLICY "Service role full access" ON clients
  FOR ALL USING (true)
  WITH CHECK (true);

-- Create policy for admins (if authenticated via frontend)
CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create policy for clients to view their own client record
CREATE POLICY "Clients can view own client" ON clients
  FOR SELECT USING (
    id IN (
      SELECT client_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.client_id IS NOT NULL
    )
  );

-- Verify policies are created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'clients';
