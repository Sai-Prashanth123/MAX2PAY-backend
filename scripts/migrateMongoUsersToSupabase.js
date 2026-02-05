const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const User = require('../models/User');

// Use same Supabase credentials as other scripts
const supabaseUrl = process.env.SUPABASE_URL || 'https://taboklgtcpykicqufkha.supabase.co';
// Service role key needed for admin operations; must be set in .env
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set. Please add it to your .env before running this script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function migrateUser(user) {
  const email = user.email;
  const password = 'Temp1234!'; // Temporary password; user should reset
  const name = user.name;
  const role = user.role || 'client';

  // 1) Find or create Supabase auth user
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    throw new Error(`Failed to list Supabase users: ${listError.message}`);
  }

  let sbUser = list.users.find((u) => u.email === email);

  if (!sbUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (error) {
      throw new Error(`Failed to create Supabase user for ${email}: ${error.message}`);
    }
    sbUser = data.user;
    console.log(`✅ Created Supabase user: ${email}`);
  } else {
    console.log(`ℹ️ Supabase user already exists: ${email}`);
  }

  // 2) Upsert into user_profiles
  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert(
      {
        id: sbUser.id,
        name,
        email,
        role,
        client_id: user.clientId ? user.clientId.toString() : null,
        phone: user.phone || null,
        is_active: user.isActive !== false,
        last_login: user.lastLogin || null,
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    throw new Error(`Failed to upsert user_profiles for ${email}: ${profileError.message}`);
  }

  console.log(`✅ Migrated profile for ${email} (role=${role})`);
}

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI is not set in .env. Cannot connect to MongoDB.');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({});
    if (!users.length) {
      console.log('ℹ️ No MongoDB users found to migrate.');
      process.exit(0);
    }

    console.log(`🌱 Migrating ${users.length} Mongo users to Supabase...`);

    for (const user of users) {
      // eslint-disable-next-line no-await-in-loop
      await migrateUser(user);
    }

    console.log('\n🎉 Migration complete. Existing Mongo users now exist in Supabase Auth + user_profiles.');
    console.log('   Note: They have a temporary password "Temp1234!" unless already existing in Supabase.');
    console.log('   You can now stop using Mongo-based login for these accounts.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

run();

