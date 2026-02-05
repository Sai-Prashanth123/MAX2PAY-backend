const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Lock all orders that are already included in existing invoices
 * This script should be run after adding the order locking migration
 */

async function lockExistingInvoicedOrders() {
  try {
    console.log('\n🔒 LOCKING ORDERS FROM EXISTING INVOICES');
    console.log('========================================\n');

    // Fetch all invoices
    const { data: invoices, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('invoice_number, line_items, type')
      .eq('type', 'monthly')
      .order('created_at', { ascending: false });

    if (invoiceError) {
      console.error('❌ Failed to fetch invoices:', invoiceError.message);
      process.exit(1);
    }

    console.log(`📋 Found ${invoices.length} monthly invoices\n`);

    let totalOrdersLocked = 0;

    for (const invoice of invoices) {
      console.log(`\n📄 Processing invoice: ${invoice.invoice_number}`);
      
      // Extract order numbers from line items
      const orderNumbers = [];
      if (invoice.line_items && Array.isArray(invoice.line_items)) {
        invoice.line_items.forEach(item => {
          if (item.orderNumber) {
            orderNumbers.push(item.orderNumber);
          }
        });
      }

      if (orderNumbers.length === 0) {
        console.log('   ⚠️  No order numbers found in line items');
        continue;
      }

      console.log(`   Found ${orderNumbers.length} orders: ${orderNumbers.join(', ')}`);

      // Fetch orders by order numbers
      const { data: orders, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, invoiced_in')
        .in('order_number', orderNumbers);

      if (orderError) {
        console.error(`   ❌ Failed to fetch orders:`, orderError.message);
        continue;
      }

      // Lock orders that aren't already locked
      const ordersToLock = orders.filter(o => !o.invoiced_in);
      
      if (ordersToLock.length === 0) {
        console.log(`   ✅ All orders already locked`);
        continue;
      }

      const orderIdsToLock = ordersToLock.map(o => o.id);
      
      const { error: lockError } = await supabaseAdmin
        .from('orders')
        .update({ invoiced_in: invoice.invoice_number })
        .in('id', orderIdsToLock);

      if (lockError) {
        console.error(`   ❌ Failed to lock orders:`, lockError.message);
      } else {
        console.log(`   ✅ Locked ${ordersToLock.length} orders`);
        totalOrdersLocked += ordersToLock.length;
      }
    }

    console.log('\n========================================');
    console.log('📊 SUMMARY');
    console.log('========================================');
    console.log(`Total Invoices Processed: ${invoices.length}`);
    console.log(`Total Orders Locked: ${totalOrdersLocked}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

lockExistingInvoicedOrders();
