-- ============================================
-- RLS Policies for 3PL WMS
-- ============================================
-- Run this SQL in Supabase SQL Editor after creating tables
-- ============================================

-- ============================================
-- USER_PROFILES POLICIES
-- ============================================
-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (except role and client_id)
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can do everything (for backend operations)
-- Note: Backend uses service role key, so this is safe
DROP POLICY IF EXISTS "Service role full access" ON user_profiles;
CREATE POLICY "Service role full access" ON user_profiles
  FOR ALL USING (true);

-- ============================================
-- CLIENTS POLICIES
-- ============================================
-- Admins can do everything
CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Clients can view their own client record
CREATE POLICY "Clients can view own client" ON clients
  FOR SELECT USING (
    id IN (
      SELECT client_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access" ON clients;
CREATE POLICY "Service role full access" ON clients
  FOR ALL USING (true);

-- ============================================
-- PRODUCTS POLICIES
-- ============================================
-- Admins can do everything
CREATE POLICY "Admins can manage products" ON products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Clients can view/manage their own products
CREATE POLICY "Clients can manage own products" ON products
  FOR ALL USING (
    client_id IN (
      SELECT client_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access" ON products;
CREATE POLICY "Service role full access" ON products
  FOR ALL USING (true);

-- ============================================
-- INVENTORY POLICIES
-- ============================================
-- Admins can do everything
CREATE POLICY "Admins can manage inventory" ON inventory
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Clients can view/manage their own inventory
CREATE POLICY "Clients can manage own inventory" ON inventory
  FOR ALL USING (
    client_id IN (
      SELECT client_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access" ON inventory;
CREATE POLICY "Service role full access" ON inventory
  FOR ALL USING (true);

-- ============================================
-- ORDERS POLICIES
-- ============================================
-- Admins can do everything
CREATE POLICY "Admins can manage orders" ON orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Clients can view/manage their own orders
CREATE POLICY "Clients can manage own orders" ON orders
  FOR ALL USING (
    client_id IN (
      SELECT client_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access" ON orders;
CREATE POLICY "Service role full access" ON orders
  FOR ALL USING (true);

-- ============================================
-- INVOICES POLICIES
-- ============================================
-- Admins can do everything
CREATE POLICY "Admins can manage invoices" ON invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Clients can view their own invoices
CREATE POLICY "Clients can view own invoices" ON invoices
  FOR SELECT USING (
    client_id IN (
      SELECT client_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access" ON invoices;
CREATE POLICY "Service role full access" ON invoices
  FOR ALL USING (true);

-- ============================================
-- OTHER TABLES - Service role only for now
-- ============================================
-- For other tables (inbound_logs, payments, notifications, etc.)
-- Backend uses service role key, so RLS is bypassed
-- You can add specific policies later if needed

-- ============================================
-- COMPLETED
-- ============================================
