/**
 * Script to assign a client_id to the demo client user (client@demo3pl.com)
 * This ensures the demo client user can log in and access client-specific features
 */

require('dotenv').config();
const supabaseAdmin = require('../config/supabaseAdmin');

async function assignClientToDemoUser() {
  try {
    console.log('🔧 Assigning client_id to demo client user...\n');

    // 1. Find the demo client user
    const { data: demoUser, error: userError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('email', 'client@demo3pl.com')
      .single();

    if (userError || !demoUser) {
      console.error('❌ Demo client user not found:', userError?.message);
      console.log('   Please ensure the user client@demo3pl.com exists in user_profiles');
      process.exit(1);
    }

    console.log(`✅ Found demo user: ${demoUser.email} (ID: ${demoUser.id})`);
    console.log(`   Current client_id: ${demoUser.client_id || 'null'}\n`);

    // 2. Find the first available client (or use a specific one)
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, company_name')
      .order('created_at', { ascending: true })
      .limit(1);

    if (clientsError || !clients || clients.length === 0) {
      console.error('❌ No clients found in database');
      console.log('   Please create at least one client before running this script');
      process.exit(1);
    }

    const targetClient = clients[0];
    console.log(`📌 Target client: ${targetClient.company_name} (ID: ${targetClient.id})\n`);

    // 3. If user already has this client_id, skip
    if (demoUser.client_id === targetClient.id) {
      console.log('✅ Demo user already has the correct client_id assigned');
      console.log(`   No update needed.\n`);
      process.exit(0);
    }

    // 4. Update the user's client_id
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({ 
        client_id: targetClient.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', demoUser.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update user:', updateError.message);
      process.exit(1);
    }

    console.log('✅ Successfully assigned client_id to demo user!');
    console.log(`   User: ${updatedUser.email}`);
    console.log(`   Client: ${targetClient.company_name} (${targetClient.id})\n`);
    console.log('💡 The demo client user can now log in and access client-specific features.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

assignClientToDemoUser();
