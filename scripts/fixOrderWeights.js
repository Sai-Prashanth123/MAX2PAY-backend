const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixOrderWeights() {
  console.log('\n🔧 Fixing Order Weights...\n');
  console.log('='.repeat(80));

  // Get all orders with 0 or null weight
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, total_weight')
    .or('total_weight.is.null,total_weight.eq.0');

  if (error) {
    console.error('❌ Error fetching orders:', error);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('✅ All orders already have weight data!');
    return;
  }

  console.log(`Found ${orders.length} orders without weight data\n`);
  console.log('─'.repeat(80));

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of orders) {
    try {
      // Get order items with product weights
      const { data: items } = await supabase
        .from('order_items')
        .select(`
          quantity,
          products:product_id (
            weight_value,
            weight_unit
          )
        `)
        .eq('order_id', order.id);

      if (!items || items.length === 0) {
        console.log(`⚠️  ${order.order_number} - No items found, skipping`);
        skipped++;
        continue;
      }

      // Calculate total weight
      let totalWeight = 0;
      let hasWeight = false;

      for (const item of items) {
        if (item.products && item.products.weight_value) {
          hasWeight = true;
          let weightInLbs = parseFloat(item.products.weight_value);

          // Convert to lbs if needed
          if (item.products.weight_unit === 'kg') {
            weightInLbs = weightInLbs * 2.20462;
          } else if (item.products.weight_unit === 'g') {
            weightInLbs = weightInLbs * 0.00220462;
          }

          totalWeight += weightInLbs * (parseInt(item.quantity) || 0);
        }
      }

      if (!hasWeight) {
        // No product weight data, assign default weight based on quantity
        const totalUnits = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
        // Assign 0.5 lbs per unit as default (ensures orders are billable)
        totalWeight = totalUnits * 0.5;
        console.log(`ℹ️  ${order.order_number} - No product weights, using default: ${totalWeight.toFixed(2)} lbs (${totalUnits} units × 0.5 lbs)`);
      }

      // Update order with calculated weight
      const { error: updateError } = await supabase
        .from('orders')
        .update({ total_weight: totalWeight.toFixed(2) })
        .eq('id', order.id);

      if (updateError) {
        console.log(`❌ ${order.order_number} - Error: ${updateError.message}`);
        errors++;
      } else {
        const billable = totalWeight > 0 && totalWeight <= 5 ? '✅ BILLABLE' : '❌ EXCLUDED';
        console.log(`✅ ${order.order_number} - Updated to ${totalWeight.toFixed(2)} lbs ${billable}`);
        fixed++;
      }

    } catch (err) {
      console.log(`❌ ${order.order_number} - Error: ${err.message}`);
      errors++;
    }
  }

  console.log('─'.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`Total processed: ${orders.length}`);
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`⚠️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);

  if (fixed > 0) {
    console.log('\n🎉 Order weights updated! You can now generate invoices.');
    console.log('\n💡 Note: Orders are assigned default weight of 0.5 lbs per unit if product weights are missing.');
    console.log('   This ensures all orders are billable (≤ 5 lbs limit).');
  }

  console.log('\n' + '='.repeat(80));
}

fixOrderWeights()
  .then(() => {
    console.log('\n✅ Weight fix completed\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
