require('dotenv').config();
const supabaseAdmin = require('../config/supabaseAdmin');

async function resetUserPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: node resetUserPassword.js <email> <newPassword>');
    console.error('Example: node resetUserPassword.js user@example.com NewPassword123');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('❌ Password must be at least 6 characters');
    process.exit(1);
  }

  try {
    console.log('🔍 Finding user with email:', email);

    // Get user by email
    const { data: users, error: getUserError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (getUserError) {
      console.error('❌ Error fetching users:', getUserError.message);
      process.exit(1);
    }

    const user = users.users.find(u => u.email === email);

    if (!user) {
      console.error('❌ User not found with email:', email);
      process.exit(1);
    }

    console.log('✅ User found:', user.email);
    console.log('User ID:', user.id);

    // Update password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (error) {
      console.error('❌ Error updating password:', error.message);
      process.exit(1);
    }

    console.log('✅ Password reset successfully!');
    console.log('User can now login with:');
    console.log('  Email:', email);
    console.log('  New Password: [hidden for security]');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetUserPassword();
