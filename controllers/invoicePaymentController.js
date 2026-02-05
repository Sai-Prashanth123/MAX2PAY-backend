const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../utils/auditLogger');
const { 
  computeBalanceDue, 
  deriveStatus, 
  prepareInvoiceUpdate 
} = require('../utils/invoiceStateValidator');

/**
 * Record a payment against an invoice
 * Supports partial payments and multiple installments
 * 
 * @route POST /api/invoices/:id/payments
 * @access Admin only
 */
exports.recordPayment = async (req, res, next) => {
  try {
    const { id: invoiceId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNumber, notes } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than 0'
      });
    }

    // Fetch invoice with current payment status
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, client_id, total_amount, paid_amount, balance_due, status')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // CRITICAL: Prevent overpayment
    const currentPaidAmount = parseFloat(invoice.paid_amount || 0);
    const totalAmount = parseFloat(invoice.total_amount);
    const paymentAmount = parseFloat(amount);
    const newPaidAmount = currentPaidAmount + paymentAmount;

    if (newPaidAmount > totalAmount) {
      const maxAllowed = totalAmount - currentPaidAmount;
      return res.status(400).json({
        success: false,
        message: `Payment amount exceeds invoice total. Maximum allowed: $${maxAllowed.toFixed(2)}`,
        code: 'PAYMENT_EXCEEDS_TOTAL',
        data: {
          totalAmount: totalAmount,
          alreadyPaid: currentPaidAmount,
          maxPayment: maxAllowed,
          attemptedPayment: paymentAmount
        }
      });
    }

    // CRITICAL: Use validator to compute correct values
    // Never manually calculate - always derive from source of truth
    const newBalanceDue = computeBalanceDue(totalAmount, newPaidAmount);
    const newStatus = deriveStatus(totalAmount, newPaidAmount);

    console.log(`💰 Recording payment for invoice ${invoice.invoice_number}`);
    console.log(`   Amount: $${paymentAmount.toFixed(2)}`);
    console.log(`   Previous paid: $${currentPaidAmount.toFixed(2)}`);
    console.log(`   New paid: $${newPaidAmount.toFixed(2)}`);
    console.log(`   Balance due: $${newBalanceDue.toFixed(2)}`);
    console.log(`   Status: ${invoice.status} → ${newStatus}`);

    // Insert payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('invoice_payments')
      .insert({
        invoice_id: invoiceId,
        amount: paymentAmount,
        payment_date: paymentDate || new Date().toISOString().split('T')[0],
        payment_method: paymentMethod || null,
        reference_number: referenceNumber || null,
        notes: notes || null,
        created_by: req.user.id
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Failed to insert payment:', paymentError);
      return res.status(500).json({
        success: false,
        message: 'Failed to record payment'
      });
    }

    // Update invoice with new paid amount and status
    const updateData = {
      paid_amount: newPaidAmount,
      balance_due: newBalanceDue,
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Set paid_date if fully paid
    if (newStatus === 'paid' && !invoice.paid_date) {
      updateData.paid_date = paymentDate || new Date().toISOString().split('T')[0];
    }

    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .single();

    if (updateError) {
      console.error('Failed to update invoice:', updateError);
      // Rollback payment record
      await supabaseAdmin.from('invoice_payments').delete().eq('id', payment.id);
      return res.status(500).json({
        success: false,
        message: 'Failed to update invoice after payment'
      });
    }

    // Audit log
    await createAuditLog(
      req.user.id,
      'PAYMENT',
      'Invoice',
      invoiceId,
      {
        paymentAmount: paymentAmount,
        previousPaid: currentPaidAmount,
        newPaid: newPaidAmount,
        balanceDue: newBalanceDue,
        status: newStatus
      },
      req
    );

    console.log(`✅ Payment recorded successfully`);

    res.status(201).json({
      success: true,
      message: newStatus === 'paid' 
        ? `Payment of $${paymentAmount.toFixed(2)} recorded. Invoice is now fully paid!`
        : `Partial payment of $${paymentAmount.toFixed(2)} recorded. Balance due: $${newBalanceDue.toFixed(2)}`,
      data: {
        payment: payment,
        invoice: updatedInvoice,
        summary: {
          totalAmount: totalAmount,
          paidAmount: newPaidAmount,
          balanceDue: newBalanceDue,
          status: newStatus,
          fullyPaid: newStatus === 'paid'
        }
      }
    });

  } catch (error) {
    console.error('Payment recording error:', error);
    next(error);
  }
};

/**
 * Get all payments for an invoice
 * 
 * @route GET /api/invoices/:id/payments
 * @access Admin and invoice owner
 */
exports.getInvoicePayments = async (req, res, next) => {
  try {
    const { id: invoiceId } = req.params;

    // Fetch invoice to check ownership
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('client_id')
      .eq('id', invoiceId)
      .single();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Authorization check for clients
    if (req.user.role === 'client' && invoice.client_id !== req.user.client_id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these payments'
      });
    }

    // Fetch all payments for this invoice
    const { data: payments, error } = await supabaseAdmin
      .from('invoice_payments')
      .select(`
        *,
        user_profiles:created_by (
          id,
          name,
          email
        )
      `)
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payments'
      });
    }

    // Calculate summary
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    res.status(200).json({
      success: true,
      data: {
        payments: payments,
        summary: {
          paymentCount: payments.length,
          totalPaid: totalPaid
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Delete a payment (Admin only, for corrections)
 * 
 * @route DELETE /api/invoices/:invoiceId/payments/:paymentId
 * @access Admin only
 */
exports.deletePayment = async (req, res, next) => {
  try {
    const { invoiceId, paymentId } = req.params;

    // Fetch payment
    const { data: payment } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('invoice_id', invoiceId)
      .single();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Fetch invoice
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('paid_amount, total_amount, balance_due')
      .eq('id', invoiceId)
      .single();

    // Calculate new amounts after deletion
    const paymentAmount = parseFloat(payment.amount);
    const newPaidAmount = parseFloat(invoice.paid_amount) - paymentAmount;
    const newBalanceDue = parseFloat(invoice.total_amount) - newPaidAmount;
    
    // Determine new status
    let newStatus;
    if (newPaidAmount <= 0) {
      newStatus = 'sent';
    } else if (newBalanceDue > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'paid';
    }

    // Delete payment
    const { error: deleteError } = await supabaseAdmin
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId);

    if (deleteError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete payment'
      });
    }

    // Update invoice
    await supabaseAdmin
      .from('invoices')
      .update({
        paid_amount: newPaidAmount,
        balance_due: newBalanceDue,
        status: newStatus,
        paid_date: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null
      })
      .eq('id', invoiceId);

    await createAuditLog(req.user.id, 'DELETE', 'Payment', paymentId, payment, req);

    res.status(200).json({
      success: true,
      message: 'Payment deleted and invoice updated'
    });

  } catch (error) {
    next(error);
  }
};
