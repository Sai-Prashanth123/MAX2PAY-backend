const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testMonthlyInvoiceGeneration() {
  console.log('\n🧪 Testing Monthly Invoice Generation...\n');
  console.log('='.repeat(80));

  // Get all active clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('is_active', true)
    .limit(5);

  if (!clients || clients.length === 0) {
    console.log('❌ No active clients found');
    return;
  }

  console.log(`\nFound ${clients.length} active clients\n`);

  // Test for January 2026
  const month = 1;
  const year = 2026;
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  console.log(`Testing for: January 2026`);
  console.log(`Date range: ${startDate.split('T')[0]} to ${endDate.split('T')[0]}\n`);
  console.log('─'.repeat(80));

  for (const client of clients) {
    console.log(`\n📋 Client: ${client.company_name}`);
    console.log(`   ID: ${client.id}`);

    // Check for existing invoice
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('client_id', client.id)
      .eq('type', 'monthly')
      .eq('billing_period_month', month)
      .eq('billing_period_year', year)
      .single();

    if (existingInvoice) {
      console.log(`   ⚠️  Invoice already exists: ${existingInvoice.invoice_number}`);
      continue;
    }

    // Get orders for this client
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at')
      .eq('client_id', client.id)
      .in('status', ['delivered', 'dispatched'])
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (!orders || orders.length === 0) {
      console.log(`   ❌ No orders found (status: delivered/dispatched)`);
      continue;
    }

    console.log(`   ✅ Found ${orders.length} order(s):`);

    let totalUnits = 0;
    let totalCharge = 0;

    for (const order of orders) {
      // Get order items
      const { data: items } = await supabase
        .from('order_items')
        .select('quantity')
        .eq('order_id', order.id);

      const orderUnits = (items || []).reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0);

      if (orderUnits > 0) {
        const charge = 2.50 + ((orderUnits - 1) * 1.25);
        totalUnits += orderUnits;
        totalCharge += charge;
        console.log(`      - ${order.order_number}: ${orderUnits} units = $${charge.toFixed(2)}`);
      } else {
        console.log(`      - ${order.order_number}: 0 units (no items)`);
      }
    }

    if (totalUnits > 0) {
      console.log(`   💰 Total: ${orders.length} orders, ${totalUnits} units = $${totalCharge.toFixed(2)}`);
      console.log(`   ✅ READY TO GENERATE INVOICE`);
    } else {
      console.log(`   ❌ Cannot generate: All orders have 0 units`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Summary:');
  console.log('   - If client shows "No orders found", they have no delivered/dispatched orders');
  console.log('   - If orders have "0 units", they have no items or items with 0 quantity');
  console.log('   - If "READY TO GENERATE", invoice generation should work');
  console.log('\n');
}

testMonthlyInvoiceGeneration()
  .then(() => {
    console.log('✅ Test completed\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
