-- ============================================
-- REMOVE ALL DEMO DATA
-- Keeps only admin user, removes everything else
-- ============================================

-- Delete in correct order to respect foreign key constraints

-- Delete audit logs (keep admin's)
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
-- VERIFICATION
-- ============================================

SELECT 
  '✅ All demo data removed' as status,
  (SELECT COUNT(*) FROM clients) as total_clients,
  (SELECT COUNT(*) FROM user_profiles) as total_users,
  (SELECT COUNT(*) FROM products) as total_products,
  (SELECT COUNT(*) FROM inventory) as total_inventory_records,
  (SELECT COUNT(*) FROM orders) as total_orders,
  (SELECT COUNT(*) FROM invoices) as total_invoices;

-- Show remaining users
SELECT 
  email,
  name,
  role
FROM user_profiles
ORDER BY email;
