/**
 * Script to check inventory records for demo client user
 * This helps diagnose why inventory is not showing up
 */

require('dotenv').config();
const supabaseAdmin = require('../config/supabaseAdmin');

async function checkInventory() {
  try {
    console.log('🔍 Checking inventory records...\n');

    // 1. Get demo client user
    const { data: demoUser, error: userError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('email', 'client@demo3pl.com')
      .single();

    if (userError || !demoUser) {
      console.error('❌ Demo client user not found:', userError?.message);
      process.exit(1);
    }

    console.log(`✅ Found demo user: ${demoUser.email}`);
    console.log(`   User ID: ${demoUser.id}`);
    console.log(`   Client ID: ${demoUser.client_id || 'null'}\n`);

    if (!demoUser.client_id) {
      console.error('❌ Demo user has no client_id assigned!');
      console.log('   Run: node scripts/assignClientToDemoUser.js');
      process.exit(1);
    }

    // 2. Get all clients
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, company_name')
      .order('created_at', { ascending: true });

    console.log('📋 Available clients:');
    clients.forEach(client => {
      const isMatch = client.id === demoUser.client_id;
      console.log(`   ${isMatch ? '✅' : '  '} ${client.company_name} (${client.id})`);
    });
    console.log('');

    // 3. Get inventory for this client
    const { data: inventory, error: invError } = await supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku
        ),
        clients:client_id (
          id,
          company_name
        )
      `)
      .eq('client_id', demoUser.client_id);

    if (invError) {
      console.error('❌ Error fetching inventory:', invError.message);
      process.exit(1);
    }

    console.log(`📦 Inventory records for client ${demoUser.client_id}:`);
    console.log(`   Total records: ${inventory?.length || 0}\n`);

    if (!inventory || inventory.length === 0) {
      console.log('⚠️  No inventory records found!');
      console.log('   This could mean:');
      console.log('   1. Products exist but no inventory was created');
      console.log('   2. Inventory was created for a different client_id');
      console.log('   3. Inventory needs to be seeded\n');

      // Check if products exist
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name, sku, client_id')
        .eq('client_id', demoUser.client_id);

      console.log(`📦 Products for client ${demoUser.client_id}:`);
      console.log(`   Total products: ${products?.length || 0}\n`);

      if (products && products.length > 0) {
        console.log('   Products found but no inventory. Creating inventory records...\n');
        
        for (const product of products) {
          // Check if inventory exists
          const { data: existingInv } = await supabaseAdmin
            .from('inventory')
            .select('id')
            .eq('product_id', product.id)
            .eq('client_id', demoUser.client_id)
            .single();

          if (!existingInv) {
            const { error: createError } = await supabaseAdmin
              .from('inventory')
              .insert({
                product_id: product.id,
                client_id: demoUser.client_id,
                total_stock: 0,
                available_stock: 0,
                reserved_stock: 0,
                dispatched_stock: 0
              });

            if (createError) {
              console.error(`   ❌ Failed to create inventory for ${product.sku}:`, createError.message);
            } else {
              console.log(`   ✅ Created inventory for ${product.name} (${product.sku})`);
            }
          }
        }
      } else {
        console.log('   No products found. Run seed script: node scripts/seedDemoData.js\n');
      }
    } else {
      console.log('   Inventory records:');
      inventory.forEach((inv, index) => {
        console.log(`   ${index + 1}. ${inv.products?.name || 'Unknown'} (${inv.products?.sku || 'N/A'})`);
        console.log(`      Total: ${inv.total_stock}, Available: ${inv.available_stock}, Reserved: ${inv.reserved_stock}, Dispatched: ${inv.dispatched_stock}`);
      });
    }

    // 4. Calculate stats
    const stats = {
      totalProducts: new Set(inventory?.map(item => item.product_id) || []).size,
      totalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0
    };

    inventory?.forEach(item => {
      stats.totalStock += item.total_stock || 0;
      stats.availableStock += item.available_stock || 0;
      stats.reservedStock += item.reserved_stock || 0;
      stats.dispatchedStock += item.dispatched_stock || 0;
    });

    console.log('\n📊 Statistics:');
    console.log(`   Total Products: ${stats.totalProducts}`);
    console.log(`   Total Stock: ${stats.totalStock}`);
    console.log(`   Available Stock: ${stats.availableStock}`);
    console.log(`   Reserved Stock: ${stats.reservedStock}`);
    console.log(`   Dispatched Stock: ${stats.dispatchedStock}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

checkInventory();
