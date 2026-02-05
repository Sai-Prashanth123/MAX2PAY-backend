const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://taboklgtcpykicqufkha.supabase.co';
// Try JWT format first (standard Supabase service role key), then fallback to provided format
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYm9rbGd0Y3B5a2ljcXVma2hhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQ1ODYzMiwiZXhwIjoyMDgzMDM0NjMyfQ.ejd8-EN_SNkr4UQNjhfqqTkIAw2064MRObMdrAbNAvk';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const usersToSeed = [
  {
    email: 'admin@demo3pl.com',
    password: 'Admin@123',
    name: 'System Admin',
    role: 'admin',
  },
  {
    email: 'client@demo3pl.com',
    password: 'Client@123',
    name: 'Demo Client User',
    role: 'client',
  },
];

async function ensureUser({ email, password, name, role }) {
  try {
    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error(`⚠️  Error listing users: ${listError.message}`);
    }
    
    const existingUser = existingUsers?.users?.find((u) => u.email === email);
    
    let user;
    if (existingUser) {
      console.log(`ℹ️  User ${email} already exists, updating...`);
      user = existingUser;
      
      // Update password if needed
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: password,
        user_metadata: { name, role },
      });
      if (updateError) {
        console.error(`⚠️  Error updating user ${email}: ${updateError.message}`);
      }
    } else {
      // Create new user
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

      if (error) {
        throw new Error(`Failed to create user ${email}: ${error.message}`);
      }
      user = data.user;
      console.log(`✅ Created Supabase Auth user: ${email}`);
    }

    if (!user) {
      throw new Error(`Failed to get user for ${email}`);
    }

    // Upsert profile in user_profiles table
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          id: user.id,
          name,
          email,
          role,
          client_id: null,
          phone: null,
          is_active: true,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      throw new Error(`Failed to create user_profiles for ${email}: ${profileError.message}`);
    }

    console.log(`✅ Seeded user profile: ${email} (${role})`);
    return user;
  } catch (error) {
    console.error(`❌ Error processing ${email}:`, error.message || error);
    throw error;
  }
}

async function run() {
  try {
    console.log('🌱 Seeding Supabase Auth users...\n');
    
    // Test connection first
    const { data: testData, error: testError } = await supabase.auth.admin.listUsers();
    if (testError) {
      console.error('❌ Cannot connect to Supabase Auth:', testError.message);
      console.error('\n💡 Make sure:');
      console.error('   1. SUPABASE_SERVICE_ROLE_KEY is set correctly in .env');
      console.error('   2. The service role key has admin privileges');
      console.error('   3. Your Supabase project is active\n');
      process.exit(1);
    }
    
    console.log(`✅ Connected to Supabase (found ${testData?.users?.length || 0} existing users)\n`);
    
    // Check if user_profiles table exists
    const { error: tableCheckError } = await supabase
      .from('user_profiles')
      .select('id')
      .limit(1);
    
    if (tableCheckError && tableCheckError.message?.includes('schema cache')) {
      console.error('❌ The user_profiles table does not exist in Supabase!\n');
      console.error('📋 Please run this SQL in your Supabase SQL Editor first:');
      console.error('   https://taboklgtcpykicqufkha.supabase.co/project/_/sql\n');
      console.error('   Or run: backend/scripts/createUserProfilesTable.sql\n');
      console.error('   Then run this script again.\n');
      process.exit(1);
    }
    
    for (const u of usersToSeed) {
      await ensureUser(u);
    }
    
    console.log('\n🎉 Supabase auth users seeded successfully!\n');
    console.log('📝 Login Credentials:');
    console.log('─────────────────────────────────────');
    console.log('Admin:');
    console.log('  Email: admin@demo3pl.com');
    console.log('  Password: Admin@123');
    console.log('\nClient:');
    console.log('  Email: client@demo3pl.com');
    console.log('  Password: Client@123');
    console.log('─────────────────────────────────────\n');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error seeding Supabase users:', err.message || err);
    if (err.stack) console.error(err.stack);
    
    if (err.message?.includes('schema cache') || err.message?.includes('user_profiles')) {
      console.error('\n💡 The user_profiles table is missing!');
      console.error('   Run: backend/scripts/createUserProfilesTable.sql in Supabase SQL Editor\n');
    }
    
    process.exit(1);
  }
}

run();

