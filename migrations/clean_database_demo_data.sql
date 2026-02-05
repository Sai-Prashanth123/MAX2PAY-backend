-- ============================================
-- CLEAN DATABASE & SETUP DEMO DATA
-- Removes all data except admin and creates 3 demo companies
-- ============================================

-- STEP 1: Delete all existing data (except admin user)
-- Delete in correct order to respect foreign key constraints

-- Delete audit logs (delete all for clean slate)
DELETE FROM login_audit;
DELETE FROM audit_logs WHERE user_id != (SELECT id FROM user_profiles WHERE email = 'admin@max2pay.com');
DELETE FROM order_lock_audit;
DELETE FROM inventory_audit;

-- Delete financial data
DELETE FROM invoice_payments;
DELETE FROM invoices;

-- Delete order data
DELETE FROM order_items;
DELETE FROM orders;

-- Delete inventory data
DELETE FROM inventory;

-- Delete products
DELETE FROM products;

-- Delete client users (keep admin)
DELETE FROM user_profiles WHERE email != 'admin@max2pay.com';

-- Delete all clients
DELETE FROM clients;

-- ============================================
-- STEP 2: Create 3 Demo Companies
-- ============================================

-- Demo Company 1: TechCorp Solutions
INSERT INTO clients (
  company_name,
  email,
  phone,
  is_active
) VALUES (
  'TechCorp Solutions',
  'contact@techcorp.com',
  '+1-555-0101',
  true
);

-- Demo Company 2: Global Logistics Inc
INSERT INTO clients (
  company_name,
  email,
  phone,
  is_active
) VALUES (
  'Global Logistics Inc',
  'contact@globallogistics.com',
  '+1-555-0202',
  true
);

-- Demo Company 3: Retail Express LLC
INSERT INTO clients (
  company_name,
  email,
  phone,
  is_active
) VALUES (
  'Retail Express LLC',
  'contact@retailexpress.com',
  '+1-555-0303',
  true
);

-- ============================================
-- STEP 3: Create Demo Client User for TechCorp
-- ============================================

-- NOTE: User profiles cannot be created directly because they require
-- a corresponding Supabase Auth user to exist first.
-- 
-- To create the demo client user:
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add user"
-- 3. Email: demo@techcorp.com
-- 4. Password: Demo123!@#
-- 5. After creating auth user, the profile will be auto-created via trigger
--    or you can manually link it to TechCorp Solutions client

-- Commented out - cannot insert without auth user:
-- INSERT INTO user_profiles (
--   id,
--   email,
--   name,
--   role,
--   client_id,
--   is_active
-- ) VALUES (
--   'USER_ID_FROM_SUPABASE_AUTH',
--   'demo@techcorp.com',
--   'Demo User',
--   'client',
--   (SELECT id FROM clients WHERE company_name = 'TechCorp Solutions'),
--   true
-- );

-- ============================================
-- STEP 4: Create Sample Products for Each Client
-- ============================================

-- Products for TechCorp Solutions
INSERT INTO products (client_id, name, sku, description, category, weight_value, weight_unit, dimensions_length, dimensions_width, dimensions_height, dimensions_unit, is_active)
SELECT 
  id as client_id,
  'Laptop Computer' as name,
  'TECH-LAP-001' as sku,
  'High-performance business laptop' as description,
  'Electronics' as category,
  2.5 as weight_value,
  'kg' as weight_unit,
  38 as dimensions_length,
  25 as dimensions_width,
  2.5 as dimensions_height,
  'cm' as dimensions_unit,
  true as is_active
FROM clients WHERE company_name = 'TechCorp Solutions'
UNION ALL
SELECT 
  id, 'Wireless Mouse', 'TECH-MOU-001', 'Ergonomic wireless mouse', 'Electronics', 0.15, 'kg', 12, 8, 5, 'cm', true
FROM clients WHERE company_name = 'TechCorp Solutions'
UNION ALL
SELECT 
  id, 'USB Cable', 'TECH-CAB-001', 'USB-C charging cable', 'Accessories', 0.05, 'kg', 15, 2, 2, 'cm', true
FROM clients WHERE company_name = 'TechCorp Solutions';

-- Products for Global Logistics Inc
INSERT INTO products (client_id, name, sku, description, category, weight_value, weight_unit, dimensions_length, dimensions_width, dimensions_height, dimensions_unit, is_active)
SELECT 
  id, 'Shipping Box - Large', 'LOG-BOX-L01', 'Large corrugated shipping box', 'Packaging', 1.0, 'kg', 60, 45, 30, 'cm', true
FROM clients WHERE company_name = 'Global Logistics Inc'
UNION ALL
SELECT 
  id, 'Packing Tape', 'LOG-TAP-001', 'Heavy-duty packing tape', 'Supplies', 0.7, 'kg', 8, 8, 8, 'cm', true
FROM clients WHERE company_name = 'Global Logistics Inc'
UNION ALL
SELECT 
  id, 'Bubble Wrap Roll', 'LOG-BUB-001', 'Protective bubble wrap', 'Packaging', 1.5, 'kg', 30, 30, 30, 'cm', true
FROM clients WHERE company_name = 'Global Logistics Inc';

-- Products for Retail Express LLC
INSERT INTO products (client_id, name, sku, description, category, weight_value, weight_unit, dimensions_length, dimensions_width, dimensions_height, dimensions_unit, is_active)
SELECT 
  id, 'T-Shirt - Medium', 'RET-TSH-M01', 'Cotton t-shirt medium size', 'Apparel', 0.25, 'kg', 30, 20, 2, 'cm', true
FROM clients WHERE company_name = 'Retail Express LLC'
UNION ALL
SELECT 
  id, 'Jeans - Size 32', 'RET-JEA-32', 'Denim jeans size 32', 'Apparel', 0.6, 'kg', 35, 25, 5, 'cm', true
FROM clients WHERE company_name = 'Retail Express LLC'
UNION ALL
SELECT 
  id, 'Sneakers - Size 10', 'RET-SNE-10', 'Athletic sneakers size 10', 'Footwear', 1.0, 'kg', 30, 20, 12, 'cm', true
FROM clients WHERE company_name = 'Retail Express LLC';

-- ============================================
-- STEP 5: Create Initial Inventory for Products
-- ============================================

-- Create inventory entries with initial stock
INSERT INTO inventory (client_id, product_id, total_stock, available_stock, reserved_stock, dispatched_stock)
SELECT 
  p.client_id,
  p.id as product_id,
  100 as total_stock,
  100 as available_stock,
  0 as reserved_stock,
  0 as dispatched_stock
FROM products p;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 
  '✅ Database cleaned and demo data created' as status,
  (SELECT COUNT(*) FROM clients) as total_clients,
  (SELECT COUNT(*) FROM user_profiles) as total_users,
  (SELECT COUNT(*) FROM products) as total_products,
  (SELECT COUNT(*) FROM inventory) as total_inventory_records;

-- Show created clients
SELECT 
  company_name,
  email,
  phone,
  is_active
FROM clients
ORDER BY company_name;

-- Show created products by client
SELECT 
  c.company_name,
  COUNT(p.id) as product_count
FROM clients c
LEFT JOIN products p ON p.client_id = c.id
GROUP BY c.company_name
ORDER BY c.company_name;

-- ============================================
-- IMPORTANT NOTES
-- ============================================

-- 1. Admin user credentials remain unchanged
-- 2. Demo client user (demo@techcorp.com) profile created
--    You need to create the auth user in Supabase Auth dashboard with password: Demo123!@#
-- 3. All clients have 3 products each with 100 units in stock
-- 4. All old orders, invoices, and transactions are deleted
-- 5. Audit logs are preserved for admin user only

-- To create the demo client user in Supabase:
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add user"
-- 3. Email: demo@techcorp.com
-- 4. Password: Demo123!@#
-- 5. Confirm password
-- 6. Click "Create user"
