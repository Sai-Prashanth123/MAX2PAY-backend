const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://taboklgtcpykicqufkha.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYm9rbGd0Y3B5a2ljcXVma2hhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQ1ODYzMiwiZXhwIjoyMDgzMDM0NjMyfQ.ejd8-EN_SNkr4UQNjhfqqTkIAw2064MRObMdrAbNAvk';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function fixClientUser() {
  try {
    console.log('🔧 Fixing client user assignment...\n');

    // Demo client ID from seedDemoData.js
    const DEMO_CLIENT_ID = '536125be-30e2-4fcd-9cc6-1ed2a24a7cc2';
    
    // First, ensure the demo client exists
    console.log('📋 Ensuring demo client exists...');
    const { data: existingClient, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', DEMO_CLIENT_ID)
      .single();

    if (clientError && clientError.code === 'PGRST116') {
      // Client doesn't exist, create it
      console.log('Creating demo client...');
      const { data: newClient, error: createError } = await supabase
        .from('clients')
        .insert({
          id: DEMO_CLIENT_ID,
          company_name: 'Demo Tech Corp',
          email: 'client@demo3pl.com',
          contact_person: 'Demo Client User',
          phone: '555-0123',
          address: '123 Demo Street',
          city: 'Demo City',
          state: 'CA',
          zip_code: '94102',
          country: 'United States',
          is_active: true
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating demo client:', createError.message);
        return;
      }
      console.log('✅ Demo client created');
    } else if (clientError) {
      console.error('❌ Error checking demo client:', clientError.message);
      return;
    } else {
      console.log('✅ Demo client already exists');
    }

    // Now update the client user to assign the client_id
    console.log('\n👤 Updating client user profile...');
    const { data: userUpdate, error: updateError } = await supabase
      .from('user_profiles')
      .update({ client_id: DEMO_CLIENT_ID })
      .eq('email', 'client@demo3pl.com')
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating user profile:', updateError.message);
      return;
    }

    console.log('✅ Client user profile updated successfully!');
    console.log(`📋 User: ${userUpdate.name} (${userUpdate.email})`);
    console.log(`🏢 Assigned Client ID: ${userUpdate.client_id}`);

    // Verify the update
    console.log('\n🔍 Verifying user profile...');
    const { data: verifyUser, error: verifyError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .eq('email', 'client@demo3pl.com')
      .single();

    if (verifyError) {
      console.error('❌ Error verifying user:', verifyError.message);
      return;
    }

    console.log('✅ Verification successful!');
    console.log(`📊 User has client_id: ${verifyUser.client_id}`);
    console.log(`🏢 Client: ${verifyUser.clients?.company_name || 'Not found'}`);

    console.log('\n🎉 Fix completed! The client user should now be able to create orders.\n');

  } catch (error) {
    console.error('\n❌ Error fixing client user:', error.message || error);
    if (error.stack) console.error(error.stack);
  }
}

fixClientUser();
