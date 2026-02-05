const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkClientOrders() {
  console.log('\n📊 Checking Client Orders for January 2026...\n');
  console.log('='.repeat(80));

  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // Get all orders in January
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, client_id, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  // Get all clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('is_active', true);

  const clientMap = {};
  clients?.forEach(c => {
    clientMap[c.id] = {
      name: c.company_name,
      orders: { pending: 0, approved: 0, dispatched: 0, delivered: 0, total: 0 }
    };
  });

  // Count orders by client and status
  orders?.forEach(order => {
    if (clientMap[order.client_id]) {
      clientMap[order.client_id].orders[order.status]++;
      clientMap[order.client_id].orders.total++;
    }
  });

  console.log('\nClient Orders Summary:\n');
  console.log('─'.repeat(80));

  Object.entries(clientMap).forEach(([clientId, data]) => {
    if (data.orders.total > 0) {
      const billable = data.orders.dispatched + data.orders.delivered;
      const status = billable > 0 ? '✅ CAN GENERATE' : '⚠️  NO BILLABLE ORDERS';
      
      console.log(`\n${data.name}`);
      console.log(`  Total Orders: ${data.orders.total}`);
      console.log(`  - Pending: ${data.orders.pending}`);
      console.log(`  - Approved: ${data.orders.approved}`);
      console.log(`  - Dispatched: ${data.orders.dispatched} ✅`);
      console.log(`  - Delivered: ${data.orders.delivered} ✅`);
      console.log(`  ${status} (${billable} billable orders)`);
    }
  });

  console.log('\n' + '─'.repeat(80));
  console.log('\n💡 To generate monthly invoice:');
  console.log('   1. Client must have at least 1 order with status "dispatched" or "delivered"');
  console.log('   2. Orders must have items with quantities > 0');
  console.log('   3. No existing invoice for that month/year');
  console.log('\n');
}

checkClientOrders()
  .then(() => {
    console.log('✅ Check completed\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
