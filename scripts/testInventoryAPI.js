/**
 * Test script to verify inventory API response format
 */

require('dotenv').config();
const supabaseAdmin = require('../config/supabaseAdmin');

async function testInventoryAPI() {
  try {
    console.log('🧪 Testing Inventory API Query...\n');

    const DEMO_CLIENT_ID = '536125be-30e2-4fcd-9cc6-1ed2a24a7cc2';

    // Test the exact query used in the controller
    const query = supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku,
          category,
          unit,
          description,
          image_url
        ),
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .eq('client_id', DEMO_CLIENT_ID)
      .order('last_updated', { ascending: false });

    const { data: inventory, error } = await query;

    if (error) {
      console.error('❌ Query error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    console.log(`✅ Query successful! Found ${inventory?.length || 0} items\n`);

    if (!inventory || inventory.length === 0) {
      console.log('⚠️  No inventory items found');
      process.exit(0);
    }

    console.log('Sample inventory item structure:');
    console.log(JSON.stringify(inventory[0], null, 2));

    console.log('\n📊 Checking joins:');
    inventory.forEach((item, index) => {
      console.log(`\n${index + 1}. Inventory ID: ${item.id}`);
      console.log(`   Product: ${item.products ? item.products.name : 'NULL (join failed)'}`);
      console.log(`   Client: ${item.clients ? item.clients.company_name : 'NULL (join failed)'}`);
      console.log(`   Stock: Total=${item.total_stock}, Available=${item.available_stock}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

testInventoryAPI();
