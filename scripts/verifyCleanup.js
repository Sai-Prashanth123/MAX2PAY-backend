const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Verify database cleanup - check what data remains
 */
async function verifyCleanup() {
  try {
    console.log('🔍 Verifying database cleanup...\n');

    // Check orders
    const { data: orders, count: ordersCount } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' });
    console.log(`📦 Orders: ${ordersCount || 0}`);
    if (orders && orders.length > 0) {
      console.log('   Sample orders:', orders.slice(0, 3).map(o => ({ id: o.id, order_number: o.order_number })));
    }

    // Check order items
    const { data: orderItems, count: orderItemsCount } = await supabaseAdmin
      .from('order_items')
      .select('*', { count: 'exact' });
    console.log(`📋 Order Items: ${orderItemsCount || 0}`);

    // Check invoices
    const { data: invoices, count: invoicesCount } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact' });
    console.log(`💰 Invoices: ${invoicesCount || 0}`);

    // Check products
    const { data: products, count: productsCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact' });
    console.log(`📦 Products: ${productsCount || 0}`);

    // Check clients
    const { data: clients, count: clientsCount } = await supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact' });
    console.log(`🏢 Clients: ${clientsCount || 0}`);

    // Check users
    const { data: users } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, role');
    console.log(`👥 Users: ${users ? users.length : 0}`);
    if (users && users.length > 0) {
      console.log('   User accounts:');
      users.forEach(u => console.log(`     - ${u.email} (${u.role})`));
    }

    // Check inbound logs
    const { data: inboundLogs, count: inboundCount } = await supabaseAdmin
      .from('inbound_logs')
      .select('*', { count: 'exact' });
    console.log(`📥 Inbound Logs: ${inboundCount || 0}`);

    console.log('\n✅ Verification complete!');

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  }
}

// Run verification
verifyCleanup()
  .then(() => {
    console.log('\n✅ Verification script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification script failed:', error);
    process.exit(1);
  });
