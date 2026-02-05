const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Create admin account: Orders@max2pay.com
 */
async function createAdminAccount() {
  try {
    const adminEmail = 'Orders@max2pay.com';
    const adminPassword = 'Admin@123456'; // Change this to a secure password
    const adminName = 'Orders Admin';

    console.log('🔐 Creating admin account...\n');

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email')
      .eq('email', adminEmail)
      .single();

    if (existingProfile) {
      console.log(`✅ Admin account already exists: ${adminEmail}`);
      console.log(`   ID: ${existingProfile.id}`);
      return existingProfile;
    }

    // Create user in Supabase Auth
    console.log(`📧 Creating auth user: ${adminEmail}`);
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { 
        name: adminName, 
        role: 'admin' 
      }
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError.message);
      throw authError;
    }

    console.log(`✅ Auth user created: ${authUser.user.id}\n`);

    // Create user profile
    console.log('📝 Creating user profile...');
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: authUser.user.id,
        name: adminName,
        email: adminEmail,
        role: 'admin',
        is_active: true
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Error creating profile:', profileError.message);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw profileError;
    }

    console.log('✅ User profile created\n');
    console.log('✨ Admin account created successfully!\n');
    console.log('📊 Account Details:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role: admin`);
    console.log(`   ID: ${profile.id}`);
    console.log('\n⚠️  IMPORTANT: Please change the password after first login!');

    return profile;

  } catch (error) {
    console.error('❌ Error creating admin account:', error);
    throw error;
  }
}

// Run the script
createAdminAccount()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
