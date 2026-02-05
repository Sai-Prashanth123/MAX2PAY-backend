/**
 * Fix Existing Invoices - Recalculate amounts using correct formula
 * 
 * This script:
 * 1. Fetches all invoices with $0 or null amounts
 * 2. For each invoice, recalculates the amount based on:
 *    - Monthly invoices: Sum of all orders in billing period
 *    - Outbound invoices: Single order calculation
 *    - Formula: $2.50 + (number_of_units - 1) × $1.25
 * 3. Updates the invoice with correct amounts
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_RATE = 2.50;
const ADDITIONAL_UNIT_RATE = 1.25;

async function fixExistingInvoices() {
  console.log('🔧 Starting invoice fix process...\n');

  try {
    // Fetch all invoices with $0 or null amounts
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .or('total_amount.is.null,total_amount.eq.0');

    if (error) {
      console.error('❌ Error fetching invoices:', error);
      return;
    }

    if (!invoices || invoices.length === 0) {
      console.log('✅ No invoices need fixing. All amounts are correct!');
      return;
    }

    console.log(`📊 Found ${invoices.length} invoices to fix\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const invoice of invoices) {
      console.log(`\n📄 Processing invoice: ${invoice.invoice_number}`);
      console.log(`   Type: ${invoice.type}`);
      console.log(`   Current amount: $${invoice.total_amount || 0}`);

      try {
        let totalAmount = 0;
        let totalUnits = 0;
        let orderCount = 0;

        if (invoice.type === 'monthly') {
          // Monthly invoice - recalculate from orders in billing period
          if (!invoice.billing_period_start_date || !invoice.billing_period_end_date) {
            console.log('   ⚠️  Skipped: Missing billing period dates');
            skipped++;
            continue;
          }

          const { data: orders } = await supabase
            .from('orders')
            .select('id, order_number, total_weight')
            .eq('client_id', invoice.client_id)
            .in('status', ['delivered', 'dispatched'])
            .gte('created_at', invoice.billing_period_start_date)
            .lte('created_at', invoice.billing_period_end_date);

          if (!orders || orders.length === 0) {
            console.log('   ⚠️  Skipped: No orders found for billing period');
            skipped++;
            continue;
          }

          // Filter orders by weight <= 5 lbs
          const eligibleOrders = orders.filter(order => {
            const weight = parseFloat(order.total_weight || 0);
            return weight > 0 && weight <= 5;
          });

          console.log(`   Found ${orders.length} orders, ${eligibleOrders.length} eligible (≤5 lbs)`);

          for (const order of eligibleOrders) {
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('quantity')
              .eq('order_id', order.id);

            const orderUnits = (orderItems || []).reduce((sum, item) => {
              return sum + (parseInt(item.quantity) || 0);
            }, 0);

            if (orderUnits > 0) {
              const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
              totalAmount += orderCharge;
              totalUnits += orderUnits;
              orderCount++;
            }
          }

        } else if (invoice.type === 'outbound' && invoice.order_id) {
          // Outbound invoice - recalculate from single order
          const { data: order } = await supabase
            .from('orders')
            .select('id, order_number, total_weight')
            .eq('id', invoice.order_id)
            .single();

          if (!order) {
            console.log('   ⚠️  Skipped: Order not found');
            skipped++;
            continue;
          }

          const orderWeight = parseFloat(order.total_weight || 0);
          if (orderWeight > 5) {
            console.log(`   ⚠️  Skipped: Order weight ${orderWeight} lbs exceeds 5 lbs limit`);
            skipped++;
            continue;
          }

          const { data: orderItems } = await supabase
            .from('order_items')
            .select('quantity')
            .eq('order_id', order.id);

          totalUnits = (orderItems || []).reduce((sum, item) => {
            return sum + (parseInt(item.quantity) || 0);
          }, 0);

          if (totalUnits > 0) {
            totalAmount = BASE_RATE + ((totalUnits - 1) * ADDITIONAL_UNIT_RATE);
            orderCount = 1;
          }

        } else if (invoice.type === 'fulfillment') {
          // Fulfillment invoice - similar to monthly
          if (!invoice.billing_period_start_date || !invoice.billing_period_end_date) {
            console.log('   ⚠️  Skipped: Missing billing period dates');
            skipped++;
            continue;
          }

          const { data: orders } = await supabase
            .from('orders')
            .select('id, order_number, total_weight')
            .eq('client_id', invoice.client_id)
            .neq('status', 'cancelled')
            .gte('created_at', invoice.billing_period_start_date)
            .lte('created_at', invoice.billing_period_end_date);

          if (!orders || orders.length === 0) {
            console.log('   ⚠️  Skipped: No orders found for billing period');
            skipped++;
            continue;
          }

          const eligibleOrders = orders.filter(order => {
            const weight = parseFloat(order.total_weight || 0);
            return weight > 0 && weight <= 5;
          });

          for (const order of eligibleOrders) {
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('quantity')
              .eq('order_id', order.id);

            const orderUnits = (orderItems || []).reduce((sum, item) => {
              return sum + (parseInt(item.quantity) || 0);
            }, 0);

            if (orderUnits > 0) {
              const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
              totalAmount += orderCharge;
              totalUnits += orderUnits;
              orderCount++;
            }
          }
        } else {
          console.log('   ⚠️  Skipped: Unknown invoice type or missing order_id');
          skipped++;
          continue;
        }

        if (totalAmount === 0) {
          console.log('   ⚠️  Skipped: Calculated amount is $0');
          skipped++;
          continue;
        }

        // Update invoice with correct amounts
        const subtotal = Number(totalAmount.toFixed(2));
        const taxAmount = 0;
        const taxRate = 0;
        const finalTotal = subtotal;

        const lineItems = [{
          description: `Order Fulfillment (${orderCount} orders, ${totalUnits} total units)`,
          quantity: orderCount,
          unitPrice: Number((totalAmount / orderCount).toFixed(2)),
          amount: subtotal
        }];

        const { error: updateError } = await supabase
          .from('invoices')
          .update({
            line_items: lineItems,
            subtotal: subtotal,
            amount: subtotal,
            tax_amount: taxAmount,
            tax_rate: taxRate,
            total_amount: finalTotal,
            balance_due: finalTotal,
            updated_at: new Date().toISOString(),
            notes: invoice.notes 
              ? `${invoice.notes}\n\nRecalculated: $2.50 + (${totalUnits} - 1) × $1.25 = $${totalAmount.toFixed(2)}`
              : `Recalculated: $2.50 + (${totalUnits} - 1) × $1.25 = $${totalAmount.toFixed(2)}`
          })
          .eq('id', invoice.id);

        if (updateError) {
          console.log(`   ❌ Error updating: ${updateError.message}`);
          errors++;
        } else {
          console.log(`   ✅ Fixed! New amount: $${finalTotal.toFixed(2)} (${totalUnits} units)`);
          fixed++;
        }

      } catch (err) {
        console.log(`   ❌ Error processing: ${err.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total invoices processed: ${invoices.length}`);
    console.log(`✅ Fixed: ${fixed}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60));

    if (fixed > 0) {
      console.log('\n🎉 Invoice fix completed! Please refresh your browser to see updated amounts.');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

// Run the script
fixExistingInvoices()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
