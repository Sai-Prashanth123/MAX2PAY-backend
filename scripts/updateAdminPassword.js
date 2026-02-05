const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Update admin password for Orders@max2pay.com
 * You can customize the new password below
 */
async function updateAdminPassword() {
  try {
    const adminEmail = 'Orders@max2pay.com';
    const newPassword = 'SecureAdmin@2026'; // Change this to your desired password

    console.log('🔐 Updating admin password...\n');

    // Find the admin user
    const { data: adminProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, role')
      .eq('email', adminEmail)
      .single();

    if (!adminProfile) {
      console.error('❌ Admin account not found!');
      return;
    }

    console.log(`📧 Found admin: ${adminProfile.email}`);
    console.log(`🆔 User ID: ${adminProfile.id}\n`);

    // Update password in Supabase Auth
    console.log('🔄 Updating password...');
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      adminProfile.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('❌ Error updating password:', updateError.message);
      throw updateError;
    }

    console.log('✅ Password updated successfully!\n');
    console.log('📊 New Credentials:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${newPassword}`);
    console.log('\n⚠️  IMPORTANT: Save these credentials securely!');
    console.log('⚠️  You can change the password again by editing this script.');

  } catch (error) {
    console.error('❌ Error updating password:', error);
    throw error;
  }
}

// Run the script
updateAdminPassword()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
