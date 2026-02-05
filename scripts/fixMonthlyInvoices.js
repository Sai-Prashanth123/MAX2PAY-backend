const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMonthlyInvoices() {
  console.log('\n🔧 Fixing Monthly Invoices...\n');
  console.log('='.repeat(80));

  // Find all monthly invoices with incorrect amounts
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('type', 'monthly')
    .order('created_at', { ascending: false });

  if (!invoices || invoices.length === 0) {
    console.log('No monthly invoices found');
    return;
  }

  console.log(`Found ${invoices.length} monthly invoice(s)\n`);
  console.log('─'.repeat(80));

  let fixed = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    console.log(`\n📄 Invoice: ${invoice.invoice_number}`);
    console.log(`   Client ID: ${invoice.client_id}`);
    console.log(`   Period: ${invoice.billing_period_month}/${invoice.billing_period_year}`);
    console.log(`   Current Amount: $${invoice.total_amount}`);

    // Get the actual orders for this period
    const startDate = new Date(invoice.billing_period_year, invoice.billing_period_month - 1, 1).toISOString();
    const endDate = new Date(invoice.billing_period_year, invoice.billing_period_month, 0, 23, 59, 59).toISOString();

    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('client_id', invoice.client_id)
      .in('status', ['delivered', 'dispatched'])
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (!orders || orders.length === 0) {
      console.log(`   ⚠️  No orders found - skipping`);
      skipped++;
      continue;
    }

    // Calculate correct amount
    const BASE_RATE = 2.50;
    const ADDITIONAL_UNIT_RATE = 1.25;
    let totalAmount = 0;
    let totalUnits = 0;

    for (const order of orders) {
      const { data: items } = await supabase
        .from('order_items')
        .select('quantity')
        .eq('order_id', order.id);

      const orderUnits = (items || []).reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0);

      if (orderUnits > 0) {
        const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
        totalAmount += orderCharge;
        totalUnits += orderUnits;
      }
    }

    const correctAmount = Number(totalAmount.toFixed(2));

    console.log(`   📊 Actual: ${orders.length} orders, ${totalUnits} units`);
    console.log(`   💰 Correct Amount: $${correctAmount}`);

    if (correctAmount === invoice.total_amount) {
      console.log(`   ✅ Amount is correct - no fix needed`);
      skipped++;
      continue;
    }

    // Update the invoice with correct amount
    const lineItems = [{
      description: `Order Fulfillment (${orders.length} orders, ${totalUnits} total units)`,
      quantity: orders.length,
      unitPrice: Number((totalAmount / orders.length).toFixed(2)),
      amount: correctAmount
    }];

    const { error } = await supabase
      .from('invoices')
      .update({
        line_items: lineItems,
        subtotal: correctAmount,
        amount: correctAmount,
        total_amount: correctAmount,
        balance_due: correctAmount,
        notes: `Monthly invoice for ${new Date(invoice.billing_period_year, invoice.billing_period_month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}. Recalculated: ${orders.length} orders, ${totalUnits} units.`
      })
      .eq('id', invoice.id);

    if (error) {
      console.log(`   ❌ Error updating: ${error.message}`);
    } else {
      console.log(`   ✅ Fixed! Updated from $${invoice.total_amount} to $${correctAmount}`);
      fixed++;
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`   Total processed: ${invoices.length}`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log('\n' + '='.repeat(80));
}

fixMonthlyInvoices()
  .then(() => {
    console.log('\n✅ Monthly invoice fix completed\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
