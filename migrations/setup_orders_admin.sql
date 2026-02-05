-- ============================================
-- SETUP ORDERS ADMIN USER
-- Run this AFTER creating the auth user in Supabase Dashboard
-- Email: orders@max2pay.com
-- Password: Admin@1122
-- ============================================

-- Update the user profile to set as admin
-- This assumes the user profile was auto-created when you created the auth user
UPDATE user_profiles 
SET 
  role = 'admin',
  name = 'Orders Admin',
  is_active = true
WHERE email = 'orders@max2pay.com';

-- Verify the user was updated
SELECT 
  id,
  email,
  name,
  role,
  is_active,
  created_at
FROM user_profiles
WHERE email = 'orders@max2pay.com';

-- Show all admin users
SELECT 
  email,
  name,
  role,
  is_active
FROM user_profiles
WHERE role = 'admin'
ORDER BY email;
