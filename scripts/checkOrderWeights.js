const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOrderWeights() {
  console.log('\n🔍 Checking Order Weights...\n');
  console.log('='.repeat(80));

  // Get recent orders
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, total_weight, status, created_at, client_id')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('❌ No orders found in the database');
    return;
  }

  console.log(`\nFound ${orders.length} recent orders:\n`);
  console.log('─'.repeat(80));

  let billableCount = 0;
  let excludedCount = 0;
  let noWeightCount = 0;

  orders.forEach(order => {
    const weight = parseFloat(order.total_weight || 0);
    let status = '';
    let billable = false;

    if (weight === 0) {
      status = '⚠️  NO WEIGHT';
      noWeightCount++;
    } else if (weight > 0 && weight <= 5) {
      status = '✅ BILLABLE';
      billableCount++;
      billable = true;
    } else {
      status = '❌ EXCLUDED (>5 lbs)';
      excludedCount++;
    }

    const date = new Date(order.created_at).toLocaleDateString();
    console.log(`${order.order_number.padEnd(25)} | ${String(weight).padStart(6)} lbs | ${order.status.padEnd(12)} | ${date.padEnd(12)} | ${status}`);
  });

  console.log('─'.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`Total Orders: ${orders.length}`);
  console.log(`✅ Billable (≤5 lbs): ${billableCount}`);
  console.log(`❌ Excluded (>5 lbs): ${excludedCount}`);
  console.log(`⚠️  No Weight Data: ${noWeightCount}`);

  if (billableCount === 0) {
    console.log('\n⚠️  WARNING: No billable orders found!');
    console.log('\nPossible reasons:');
    console.log('1. All orders exceed 5 lbs weight limit');
    console.log('2. Orders have no weight data (total_weight = 0 or null)');
    console.log('3. No orders exist for the selected period');
    
    console.log('\n💡 Solutions:');
    console.log('1. Check if orders have weight data populated');
    console.log('2. Verify weight calculations are working');
    console.log('3. Consider adjusting weight limit if needed');
  }

  // Check a sample order for weight calculation
  if (orders.length > 0) {
    console.log('\n🔍 Sample Order Analysis:');
    const sampleOrder = orders[0];
    console.log(`\nOrder: ${sampleOrder.order_number}`);
    console.log(`Weight: ${sampleOrder.total_weight || 'NULL'} lbs`);
    console.log(`Status: ${sampleOrder.status}`);

    // Get order items
    const { data: items } = await supabase
      .from('order_items')
      .select('quantity, product_id')
      .eq('order_id', sampleOrder.id);

    if (items && items.length > 0) {
      console.log(`Items: ${items.length}`);
      const totalUnits = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
      console.log(`Total Units: ${totalUnits}`);
      
      // Calculate what the charge would be
      const charge = 2.50 + ((totalUnits - 1) * 1.25);
      console.log(`Calculated Charge: $${charge.toFixed(2)}`);
    } else {
      console.log('Items: 0 (no items found)');
    }
  }

  console.log('\n' + '='.repeat(80));
}

checkOrderWeights()
  .then(() => {
    console.log('\n✅ Check completed\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
