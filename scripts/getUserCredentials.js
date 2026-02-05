const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Get user credentials for admin and client profiles
 * This script retrieves user information from the database
 */

async function getUserCredentials() {
  try {
    console.log('\n========================================');
    console.log('🔐 RETRIEVING USER CREDENTIALS');
    console.log('========================================\n');

    // Get all active users with their profiles
    const { data: users, error } = await supabaseAdmin
      .from('user_profiles')
      .select(`
        id,
        email,
        role,
        is_active,
        created_at,
        clients:client_id (
          id,
          company_name,
          contact_person
        )
      `)
      .eq('is_active', true)
      .order('role', { ascending: false })
      .order('email');

    if (error) {
      console.error('❌ Error fetching users:', error.message);
      return;
    }

    if (!users || users.length === 0) {
      console.log('⚠️  No active users found in database');
      console.log('\nℹ️  You may need to create users first.');
      return;
    }

    // Separate admin and client users
    const adminUsers = users.filter(u => u.role === 'admin');
    const clientUsers = users.filter(u => u.role === 'client');

    // Display Admin Users
    console.log('👨‍💼 ADMIN USERS');
    console.log('================\n');
    
    if (adminUsers.length === 0) {
      console.log('⚠️  No admin users found\n');
    } else {
      adminUsers.forEach((user, index) => {
        console.log(`${index + 1}. Admin Account`);
        console.log(`   Email: ${user.email}`);
        console.log(`   User ID: ${user.id}`);
        console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
        console.log(`   Status: ${user.is_active ? '✅ Active' : '❌ Inactive'}`);
        console.log('   ⚠️  Password: Check Supabase Auth dashboard or use password reset\n');
      });
    }

    // Display Client Users
    console.log('👥 CLIENT USERS');
    console.log('================\n');
    
    if (clientUsers.length === 0) {
      console.log('⚠️  No client users found\n');
    } else {
      clientUsers.forEach((user, index) => {
        console.log(`${index + 1}. Client Account`);
        console.log(`   Email: ${user.email}`);
        console.log(`   User ID: ${user.id}`);
        console.log(`   Company: ${user.clients?.company_name || 'N/A'}`);
        console.log(`   Contact: ${user.clients?.contact_person || 'N/A'}`);
        console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
        console.log(`   Status: ${user.is_active ? '✅ Active' : '❌ Inactive'}`);
        console.log('   ⚠️  Password: Check Supabase Auth dashboard or use password reset\n');
      });
    }

    // Summary
    console.log('========================================');
    console.log('📊 SUMMARY');
    console.log('========================================');
    console.log(`Total Users: ${users.length}`);
    console.log(`Admin Users: ${adminUsers.length}`);
    console.log(`Client Users: ${clientUsers.length}`);
    console.log('========================================\n');

    // Important Notes
    console.log('📝 IMPORTANT NOTES:');
    console.log('==================');
    console.log('1. Passwords are encrypted and cannot be retrieved');
    console.log('2. To reset a password:');
    console.log('   - Use the "Forgot Password" link on login page');
    console.log('   - Or use: node backend/scripts/resetUserPassword.js');
    console.log('3. Login URL: https://lemon-smoke-0bf242700.2.azurestaticapps.net/login');
    console.log('4. Check your email spam folder for password reset emails\n');

    // Get Supabase Auth users for additional info
    console.log('🔍 Checking Supabase Auth...\n');
    
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (!authError && authUsers?.users) {
      console.log('Supabase Auth Users:');
      authUsers.users.forEach((authUser, index) => {
        const profile = users.find(u => u.id === authUser.id);
        console.log(`${index + 1}. ${authUser.email}`);
        console.log(`   Role: ${profile?.role || 'Unknown'}`);
        console.log(`   Last Sign In: ${authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleString() : 'Never'}`);
        console.log(`   Email Confirmed: ${authUser.email_confirmed_at ? '✅ Yes' : '❌ No'}`);
        console.log('');
      });
    }

    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Run the script
getUserCredentials();
