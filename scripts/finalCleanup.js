const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Final cleanup - remove all users except Orders@max2pay.com
 */
async function finalCleanup() {
  try {
    console.log('🧹 Final cleanup - removing all users except Orders@max2pay.com\n');

    // Get all users
    const { data: users } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, role');

    console.log(`Found ${users.length} users:\n`);
    users.forEach(u => console.log(`  - ${u.email} (${u.role})`));

    // Delete all except Orders@max2pay.com
    for (const user of users) {
      if (user.email !== 'Orders@max2pay.com') {
        console.log(`\n🗑️  Deleting: ${user.email}`);
        
        // First, delete from user_profiles
        const { error: profileError } = await supabaseAdmin
          .from('user_profiles')
          .delete()
          .eq('id', user.id);

        if (profileError) {
          console.error(`   ❌ Error deleting profile: ${profileError.message}`);
        } else {
          console.log(`   ✅ Profile deleted`);
        }

        // Then delete from Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        
        if (authError) {
          console.error(`   ❌ Error deleting auth: ${authError.message}`);
        } else {
          console.log(`   ✅ Auth deleted`);
        }
      } else {
        console.log(`\n✅ Keeping: ${user.email} (admin)`);
      }
    }

    console.log('\n✨ Final cleanup completed!');
    console.log('\n📊 Remaining account: Orders@max2pay.com');

  } catch (error) {
    console.error('❌ Error during final cleanup:', error);
    throw error;
  }
}

// Run cleanup
finalCleanup()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
