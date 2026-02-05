const supabaseAdmin = require('../config/supabaseAdmin');
const { normalizeInvoiceState } = require('../utils/invoiceStateValidator');

/**
 * Fix all invoices with incorrect balance_due or status
 * Recomputes all derived fields from source of truth
 */

async function fixAllInvoiceStates() {
  try {
    console.log('\n🔧 FIXING ALL INVOICE STATES');
    console.log('========================================\n');

    // Fetch all invoices
    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch invoices:', error.message);
      process.exit(1);
    }

    console.log(`📋 Found ${invoices.length} invoices to check\n`);

    let fixedCount = 0;
    let correctCount = 0;

    for (const invoice of invoices) {
      const total = parseFloat(invoice.total_amount || 0);
      const paid = parseFloat(invoice.paid_amount || 0);
      const currentBalance = parseFloat(invoice.balance_due || 0);
      const currentStatus = invoice.status;

      // Compute correct values
      const normalized = normalizeInvoiceState(invoice);
      const correctBalance = normalized.balance_due;
      const correctStatus = normalized.status;

      // Check if correction needed
      const balanceWrong = Math.abs(currentBalance - correctBalance) > 0.01;
      const statusWrong = currentStatus !== correctStatus;

      if (balanceWrong || statusWrong) {
        console.log(`🔄 Fixing: ${invoice.invoice_number}`);
        console.log(`   Total: $${total.toFixed(2)}, Paid: $${paid.toFixed(2)}`);
        
        if (balanceWrong) {
          console.log(`   Balance: $${currentBalance.toFixed(2)} → $${correctBalance.toFixed(2)}`);
        }
        
        if (statusWrong) {
          console.log(`   Status: ${currentStatus} → ${correctStatus}`);
        }

        // Update invoice
        const { error: updateError } = await supabaseAdmin
          .from('invoices')
          .update({
            balance_due: correctBalance,
            status: correctStatus,
            paid_date: normalized.paid_date,
            updated_at: new Date().toISOString()
          })
          .eq('id', invoice.id);

        if (updateError) {
          console.error(`   ❌ Failed to update: ${updateError.message}`);
        } else {
          console.log(`   ✅ Fixed\n`);
          fixedCount++;
        }
      } else {
        correctCount++;
      }
    }

    console.log('\n========================================');
    console.log('📊 SUMMARY');
    console.log('========================================');
    console.log(`Total Invoices: ${invoices.length}`);
    console.log(`✅ Already Correct: ${correctCount}`);
    console.log(`🔧 Fixed: ${fixedCount}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixAllInvoiceStates();
