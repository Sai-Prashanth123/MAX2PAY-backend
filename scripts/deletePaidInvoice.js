const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Delete a paid invoice (for testing/correction purposes)
 * USE WITH CAUTION - This is for development/testing only
 */

async function deletePaidInvoice() {
  const invoiceNumber = process.argv[2];

  if (!invoiceNumber) {
    console.error('❌ Usage: node scripts/deletePaidInvoice.js <invoice-number>');
    console.error('   Example: node scripts/deletePaidInvoice.js INV-202601-C268D3');
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Looking for invoice: ${invoiceNumber}`);

    // Find invoice
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (fetchError || !invoice) {
      console.error('❌ Invoice not found');
      process.exit(1);
    }

    console.log(`\n📋 Invoice Details:`);
    console.log(`   Number: ${invoice.invoice_number}`);
    console.log(`   Client ID: ${invoice.client_id}`);
    console.log(`   Status: ${invoice.status}`);
    console.log(`   Amount: $${invoice.total_amount}`);
    console.log(`   Month: ${invoice.billing_period_month}/${invoice.billing_period_year}`);

    // Delete associated payments first
    const { data: payments } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoice.id);

    if (payments && payments.length > 0) {
      console.log(`\n💰 Found ${payments.length} payment(s) - deleting...`);
      const { error: paymentDeleteError } = await supabaseAdmin
        .from('invoice_payments')
        .delete()
        .eq('invoice_id', invoice.id);

      if (paymentDeleteError) {
        console.error('❌ Failed to delete payments:', paymentDeleteError.message);
        process.exit(1);
      }
      console.log('✅ Payments deleted');
    }

    // Delete invoice
    console.log(`\n🗑️  Deleting invoice...`);
    const { error: deleteError } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', invoice.id);

    if (deleteError) {
      console.error('❌ Failed to delete invoice:', deleteError.message);
      process.exit(1);
    }

    console.log(`\n✅ Invoice ${invoiceNumber} deleted successfully!`);
    console.log(`\n📝 You can now regenerate the invoice with current orders.`);
    console.log(`   Go to: http://localhost:5173/invoices`);
    console.log(`   Click: Generate Invoice`);
    console.log(`   Select: TechCorp Solutions, January 2026\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

deletePaidInvoice();
