const supabaseAdmin = require('../config/supabaseAdmin');

async function getUsers() {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('user_profiles')
      .select('email, role, name, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return;
    }

    console.log('\n=== ACTIVE USER ACCOUNTS ===\n');
    
    if (!users || users.length === 0) {
      console.log('No active users found in the database.');
      console.log('\nYou need to create a user account first.');
      console.log('Run: node backend/scripts/createUser.js');
      return;
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name || 'No Name'}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
      console.log('');
    });

    console.log('=== PASSWORD INFORMATION ===');
    console.log('Passwords are encrypted and cannot be retrieved.');
    console.log('If you need to reset a password, contact your administrator.');
    console.log('\nNote: Demo accounts may have been removed.');
    console.log('You can create a new admin account using the script:');
    console.log('node backend/scripts/createUser.js');

  } catch (error) {
    console.error('Script error:', error);
  }
}

getUsers();
