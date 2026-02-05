const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Clean all data from database except Orders@max2pay.com admin account
 */
async function cleanDatabase() {
  try {
    console.log('🧹 Starting database cleanup...\n');

    // Step 1: Get the admin user ID for Orders@max2pay.com
    console.log('📧 Finding admin account: Orders@max2pay.com');
    const { data: adminProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, role')
      .eq('email', 'Orders@max2pay.com')
      .eq('role', 'admin')
      .single();

    if (!adminProfile) {
      console.error('❌ Admin account Orders@max2pay.com not found!');
      console.log('Please create this admin account first.');
      return;
    }

    console.log(`✅ Found admin account: ${adminProfile.email} (ID: ${adminProfile.id})\n`);

    // Step 2: Delete all invoices
    console.log('🗑️  Deleting all invoices...');
    const { error: invoicesError, count: invoicesCount } = await supabaseAdmin
      .from('invoices')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (invoicesError) {
      console.error('Error deleting invoices:', invoicesError.message);
    } else {
      console.log(`✅ Deleted ${invoicesCount || 0} invoices\n`);
    }

    // Step 3: Delete all order items first (foreign key constraint)
    console.log('🗑️  Deleting all order items...');
    const { error: orderItemsError, count: orderItemsCount } = await supabaseAdmin
      .from('order_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (orderItemsError) {
      console.error('Error deleting order items:', orderItemsError.message);
    } else {
      console.log(`✅ Deleted ${orderItemsCount || 0} order items\n`);
    }

    // Step 4: Delete all orders
    console.log('🗑️  Deleting all orders...');
    const { error: ordersError, count: ordersCount } = await supabaseAdmin
      .from('orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (ordersError) {
      console.error('Error deleting orders:', ordersError.message);
    } else {
      console.log(`✅ Deleted ${ordersCount || 0} orders\n`);
    }

    // Step 5: Delete all inventory logs
    console.log('🗑️  Deleting all inventory logs...');
    const { error: inventoryLogsError, count: inventoryLogsCount } = await supabaseAdmin
      .from('inventory_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (inventoryLogsError) {
      console.error('Error deleting inventory logs:', inventoryLogsError.message);
    } else {
      console.log(`✅ Deleted ${inventoryLogsCount || 0} inventory logs\n`);
    }

    // Step 6: Delete all inbound logs
    console.log('🗑️  Deleting all inbound logs...');
    const { error: inboundLogsError, count: inboundLogsCount } = await supabaseAdmin
      .from('inbound_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (inboundLogsError) {
      console.error('Error deleting inbound logs:', inboundLogsError.message);
    } else {
      console.log(`✅ Deleted ${inboundLogsCount || 0} inbound logs\n`);
    }

    // Step 7: Delete all products
    console.log('🗑️  Deleting all products...');
    const { error: productsError, count: productsCount } = await supabaseAdmin
      .from('products')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (productsError) {
      console.error('Error deleting products:', productsError.message);
    } else {
      console.log(`✅ Deleted ${productsCount || 0} products\n`);
    }

    // Step 8: Delete all clients
    console.log('🗑️  Deleting all clients...');
    const { error: clientsError, count: clientsCount } = await supabaseAdmin
      .from('clients')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (clientsError) {
      console.error('Error deleting clients:', clientsError.message);
    } else {
      console.log(`✅ Deleted ${clientsCount || 0} clients\n`);
    }

    // Step 9: Get all user profiles except the admin
    console.log('🗑️  Deleting all user accounts except Orders@max2pay.com...');
    const { data: usersToDelete } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email')
      .neq('id', adminProfile.id);

    if (usersToDelete && usersToDelete.length > 0) {
      console.log(`Found ${usersToDelete.length} users to delete:`);
      
      for (const user of usersToDelete) {
        console.log(`  - Deleting: ${user.email}`);
        
        // Delete from Supabase Auth (this will cascade delete user_profiles)
        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        
        if (deleteAuthError) {
          console.error(`    ❌ Error deleting ${user.email}:`, deleteAuthError.message);
        } else {
          console.log(`    ✅ Deleted ${user.email}`);
        }
      }
      console.log(`\n✅ Deleted ${usersToDelete.length} user accounts\n`);
    } else {
      console.log('✅ No other users to delete\n');
    }

    // Step 10: Clean audit logs (optional - keep for history or delete)
    console.log('🗑️  Cleaning audit logs...');
    const { error: auditLogsError, count: auditLogsCount } = await supabaseAdmin
      .from('audit_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (auditLogsError) {
      console.error('Error deleting audit logs:', auditLogsError.message);
    } else {
      console.log(`✅ Deleted ${auditLogsCount || 0} audit logs\n`);
    }

    // Step 11: Clean notifications
    console.log('🗑️  Deleting all notifications...');
    const { error: notificationsError, count: notificationsCount } = await supabaseAdmin
      .from('notifications')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (notificationsError) {
      console.error('Error deleting notifications:', notificationsError.message);
    } else {
      console.log(`✅ Deleted ${notificationsCount || 0} notifications\n`);
    }

    console.log('✨ Database cleanup completed!\n');
    console.log('📊 Summary:');
    console.log('  ✅ All products deleted');
    console.log('  ✅ All clients deleted');
    console.log('  ✅ All orders and order items deleted');
    console.log('  ✅ All invoices deleted');
    console.log('  ✅ All inventory logs deleted');
    console.log('  ✅ All inbound logs deleted');
    console.log('  ✅ All user accounts deleted (except Orders@max2pay.com)');
    console.log('  ✅ All audit logs deleted');
    console.log('  ✅ All notifications deleted');
    console.log(`\n🔐 Remaining admin account: ${adminProfile.email}`);
    console.log('\n✅ Database is now clean and ready for fresh data!');

  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    throw error;
  }
}

// Run the cleanup
cleanDatabase()
  .then(() => {
    console.log('\n✅ Cleanup script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup script failed:', error);
    process.exit(1);
  });
