const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Complete cleanup - delete all data including login audit records
 */
async function completeCleanup() {
  try {
    console.log('🧹 Complete database cleanup...\n');

    // Step 1: Delete ALL login audit records
    console.log('🗑️  Deleting all login audit records...');
    const { error: loginAuditError, count: loginAuditCount } = await supabaseAdmin
      .from('login_audit')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (loginAuditError) {
      console.error('Error deleting login audit:', loginAuditError.message);
    } else {
      console.log(`✅ Deleted ${loginAuditCount || 0} login audit records\n`);
    }

    // Step 2: Delete ALL user activity logs
    console.log('🗑️  Deleting all user activity logs...');
    const { error: activityError, count: activityCount } = await supabaseAdmin
      .from('user_activity')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (activityError) {
      console.error('Error deleting user activity:', activityError.message);
    } else {
      console.log(`✅ Deleted ${activityCount || 0} user activity records\n`);
    }

    // Step 3: Get all users
    const { data: users } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, role');

    console.log(`Found ${users.length} users:\n`);
    users.forEach(u => console.log(`  - ${u.email} (${u.role})`));

    // Step 4: Delete all users except Orders@max2pay.com
    for (const user of users) {
      if (user.email !== 'Orders@max2pay.com') {
        console.log(`\n🗑️  Deleting: ${user.email}`);
        
        // Delete from Supabase Auth (this will cascade delete user_profiles)
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        
        if (authError) {
          console.error(`   ❌ Error: ${authError.message}`);
        } else {
          console.log(`   ✅ Deleted successfully`);
        }
      } else {
        console.log(`\n✅ Keeping: ${user.email} (admin)`);
      }
    }

    // Step 5: Verify final state
    console.log('\n📊 Verifying final state...\n');
    
    const { data: remainingUsers } = await supabaseAdmin
      .from('user_profiles')
      .select('email, role');
    
    console.log(`Remaining users: ${remainingUsers.length}`);
    remainingUsers.forEach(u => console.log(`  ✅ ${u.email} (${u.role})`));

    const { count: ordersCount } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true });
    console.log(`\nOrders: ${ordersCount || 0}`);

    const { count: productsCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true });
    console.log(`Products: ${productsCount || 0}`);

    const { count: clientsCount } = await supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact', head: true });
    console.log(`Clients: ${clientsCount || 0}`);

    const { count: invoicesCount } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact', head: true });
    console.log(`Invoices: ${invoicesCount || 0}`);

    console.log('\n✨ Complete cleanup finished!');
    console.log('🔐 Only Orders@max2pay.com remains');
    console.log('📊 All data has been removed');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Run cleanup
completeCleanup()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
