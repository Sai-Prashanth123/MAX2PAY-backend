/**
 * Script to add stock to inventory records for demo client
 */

require('dotenv').config();
const supabaseAdmin = require('../config/supabaseAdmin');

const DEMO_CLIENT_ID = '536125be-30e2-4fcd-9cc6-1ed2a24a7cc2';

async function addStockToInventory() {
  try {
    console.log('📦 Adding stock to inventory records...\n');

    // Get all inventory for demo client
    const { data: inventory, error: invError } = await supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku
        )
      `)
      .eq('client_id', DEMO_CLIENT_ID);

    if (invError) {
      console.error('❌ Error fetching inventory:', invError.message);
      process.exit(1);
    }

    if (!inventory || inventory.length === 0) {
      console.log('⚠️  No inventory records found. Run checkInventory.js first.');
      process.exit(1);
    }

    console.log(`Found ${inventory.length} inventory records\n`);

    // Add random stock to each inventory item
    for (const inv of inventory) {
      const totalStock = Math.floor(Math.random() * 100) + 20; // 20-120
      const availableStock = Math.floor(totalStock * 0.7); // 70% available
      const reservedStock = Math.floor(totalStock * 0.2); // 20% reserved
      const dispatchedStock = totalStock - availableStock - reservedStock; // Remainder

      const { error: updateError } = await supabaseAdmin
        .from('inventory')
        .update({
          total_stock: totalStock,
          available_stock: availableStock,
          reserved_stock: reservedStock,
          dispatched_stock: dispatchedStock,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', inv.id);

      if (updateError) {
        console.error(`   ❌ Failed to update ${inv.products?.sku || inv.id}:`, updateError.message);
      } else {
        console.log(`   ✅ Updated ${inv.products?.name || 'Unknown'}: Total=${totalStock}, Available=${availableStock}, Reserved=${reservedStock}, Dispatched=${dispatchedStock}`);
      }
    }

    // Calculate final stats
    const { data: updatedInventory } = await supabaseAdmin
      .from('inventory')
      .select('total_stock, available_stock, reserved_stock, dispatched_stock')
      .eq('client_id', DEMO_CLIENT_ID);

    const stats = {
      totalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0
    };

    updatedInventory?.forEach(item => {
      stats.totalStock += item.total_stock || 0;
      stats.availableStock += item.available_stock || 0;
      stats.reservedStock += item.reserved_stock || 0;
      stats.dispatchedStock += item.dispatched_stock || 0;
    });

    console.log('\n📊 Final Statistics:');
    console.log(`   Total Stock: ${stats.totalStock}`);
    console.log(`   Available Stock: ${stats.availableStock}`);
    console.log(`   Reserved Stock: ${stats.reservedStock}`);
    console.log(`   Dispatched Stock: ${stats.dispatchedStock}\n`);

    console.log('✅ Stock added successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

addStockToInventory();
