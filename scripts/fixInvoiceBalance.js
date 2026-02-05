const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Fix invoice balance_due calculation
 * Recalculates balance_due = total_amount - paid_amount
 */

async function fixInvoiceBalance() {
  const invoiceNumber = process.argv[2] || 'INV-202601-C268D3';

  try {
    console.log(`\n🔍 Fixing balance for invoice: ${invoiceNumber}`);

    // Get invoice
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (fetchError || !invoice) {
      console.error('❌ Invoice not found');
      process.exit(1);
    }

    const totalAmount = parseFloat(invoice.total_amount || 0);
    const paidAmount = parseFloat(invoice.paid_amount || 0);
    const correctBalanceDue = totalAmount - paidAmount;

    console.log(`\n📊 Current State:`);
    console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
    console.log(`   Paid Amount: $${paidAmount.toFixed(2)}`);
    console.log(`   Current Balance Due: $${parseFloat(invoice.balance_due || 0).toFixed(2)}`);
    console.log(`   Correct Balance Due: $${correctBalanceDue.toFixed(2)}`);

    // Determine correct status
    let correctStatus;
    if (correctBalanceDue <= 0) {
      correctStatus = 'paid';
    } else if (paidAmount > 0) {
      correctStatus = 'partial';
    } else {
      correctStatus = invoice.status;
    }

    console.log(`   Current Status: ${invoice.status}`);
    console.log(`   Correct Status: ${correctStatus}`);

    // Update invoice
    console.log(`\n🔄 Updating invoice...`);
    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        balance_due: correctBalanceDue,
        status: correctStatus,
        paid_date: correctStatus === 'paid' && !invoice.paid_date ? new Date().toISOString().split('T')[0] : invoice.paid_date
      })
      .eq('id', invoice.id);

    if (updateError) {
      console.error('❌ Failed to update:', updateError.message);
      process.exit(1);
    }

    console.log(`\n✅ Invoice updated successfully!`);
    console.log(`   Balance Due: $${correctBalanceDue.toFixed(2)}`);
    console.log(`   Status: ${correctStatus}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixInvoiceBalance();
