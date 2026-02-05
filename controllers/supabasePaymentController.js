const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Get all payments
 */
exports.getAllPayments = async (req, res, next) => {
  try {
    const { invoiceId, clientId } = req.query;

    // Use admin client to bypass RLS
    let query = supabaseAdmin
      .from('payments')
      .select(`
        *,
        invoices:invoice_id (
          id,
          invoice_number
        ),
        clients:client_id (
          id,
          company_name
        ),
        user_profiles:recorded_by (
          id,
          name,
          email
        )
      `)
      .order('payment_date', { ascending: false });

    if (invoiceId && invoiceId !== 'null' && invoiceId !== 'undefined') {
      query = query.eq('invoice_id', invoiceId);
    }
    if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    const { data: payments, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch payments'
      });
    }

    const formattedPayments = (payments || []).map(payment => ({
      id: payment.id,
      _id: payment.id,
      invoiceId: payment.invoices ? {
        _id: payment.invoices.id,
        invoiceNumber: payment.invoices.invoice_number
      } : payment.invoice_id,
      clientId: payment.clients ? {
        _id: payment.clients.id,
        companyName: payment.clients.company_name
      } : payment.client_id,
      amount: parseFloat(payment.amount || 0),
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      transactionId: payment.transaction_id,
      notes: payment.notes,
      recordedBy: payment.user_profiles ? {
        _id: payment.user_profiles.id,
        name: payment.user_profiles.name,
        email: payment.user_profiles.email
      } : payment.recorded_by,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at
    }));

    res.status(200).json({
      success: true,
      data: formattedPayments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment by ID
 */
exports.getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use admin client to bypass RLS
    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .select(`
        *,
        invoices:invoice_id (
          id,
          invoice_number,
          total_amount
        ),
        clients:client_id (
          id,
          company_name
        ),
        user_profiles:recorded_by (
          id,
          name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error || !payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const formattedPayment = {
      id: payment.id,
      _id: payment.id,
      invoiceId: payment.invoices ? {
        _id: payment.invoices.id,
        invoiceNumber: payment.invoices.invoice_number,
        totalAmount: parseFloat(payment.invoices.total_amount || 0)
      } : payment.invoice_id,
      clientId: payment.clients ? {
        _id: payment.clients.id,
        companyName: payment.clients.company_name
      } : payment.client_id,
      amount: parseFloat(payment.amount || 0),
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      transactionId: payment.transaction_id,
      notes: payment.notes,
      recordedBy: payment.user_profiles ? {
        _id: payment.user_profiles.id,
        name: payment.user_profiles.name,
        email: payment.user_profiles.email
      } : payment.recorded_by,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at
    };

    res.status(200).json({
      success: true,
      data: formattedPayment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payments for an invoice
 */
exports.getInvoicePayments = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    // Use admin client to bypass RLS
    const { data: payments, error } = await supabaseAdmin
      .from('payments')
      .select(`
        *,
        user_profiles:recorded_by (
          id,
          name,
          email
        )
      `)
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch payments'
      });
    }

    const totalPaid = (payments || []).reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);

    const formattedPayments = (payments || []).map(payment => ({
      id: payment.id,
      _id: payment.id,
      amount: parseFloat(payment.amount || 0),
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      transactionId: payment.transaction_id,
      notes: payment.notes,
      recordedBy: payment.user_profiles ? {
        _id: payment.user_profiles.id,
        name: payment.user_profiles.name,
        email: payment.user_profiles.email
      } : payment.recorded_by,
      createdAt: payment.created_at
    }));

    res.status(200).json({
      success: true,
      data: {
        payments: formattedPayments,
        totalPaid
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record payment
 */
exports.recordPayment = async (req, res, next) => {
  try {
    const { invoiceId, amount, paymentDate, paymentMethod, transactionId, notes } = req.body;

    // Check if invoice exists
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Create payment
    const paymentData = {
      invoice_id: invoiceId,
      client_id: invoice.client_id,
      amount: parseFloat(amount),
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
      payment_method: paymentMethod || 'bank_transfer',
      transaction_id: transactionId || null,
      notes: notes || null,
      recorded_by: req.user.id
    };

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single();

    if (paymentError) {
      return res.status(400).json({
        success: false,
        message: paymentError.message || 'Failed to record payment'
      });
    }

    // Update invoice totals
    const { data: allPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId);

    const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const balanceDue = parseFloat(invoice.total_amount || 0) - totalPaid;

    const invoiceUpdate = {
      advance_paid: totalPaid,
      balance_due: balanceDue,
      updated_at: new Date().toISOString()
    };

    if (balanceDue <= 0) {
      invoiceUpdate.status = 'paid';
      invoiceUpdate.paid_date = new Date().toISOString().split('T')[0];
    } else if (totalPaid > 0) {
      invoiceUpdate.status = 'partial';
    }

    await supabase
      .from('invoices')
      .update(invoiceUpdate)
      .eq('id', invoiceId);

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update payment
 */
exports.updatePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, paymentMethod, transactionId, notes } = req.body;

    // Get existing payment - use admin client to bypass RLS
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const oldAmount = parseFloat(payment.amount || 0);

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (paymentDate !== undefined) updateData.payment_date = paymentDate;
    if (paymentMethod !== undefined) updateData.payment_method = paymentMethod;
    if (transactionId !== undefined) updateData.transaction_id = transactionId;
    if (notes !== undefined) updateData.notes = notes;

    // Use admin client to bypass RLS
    const { data: updatedPayment, error } = await supabaseAdmin
      .from('payments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update payment'
      });
    }

    // Recalculate invoice totals if amount changed - use admin client to bypass RLS
    if (amount !== undefined && amount !== oldAmount) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', payment.invoice_id)
        .single();

      if (invoice) {
        const { data: allPayments } = await supabaseAdmin
          .from('payments')
          .select('amount')
          .eq('invoice_id', payment.invoice_id);

        const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const balanceDue = parseFloat(invoice.total_amount || 0) - totalPaid;

        const invoiceUpdate = {
          advance_paid: totalPaid,
          balance_due: balanceDue,
          updated_at: new Date().toISOString()
        };

        if (balanceDue <= 0) {
          invoiceUpdate.status = 'paid';
          invoiceUpdate.paid_date = new Date().toISOString().split('T')[0];
        } else if (totalPaid > 0) {
          invoiceUpdate.status = 'partial';
        } else {
          invoiceUpdate.status = 'sent';
        }

        await supabaseAdmin
          .from('invoices')
          .update(invoiceUpdate)
          .eq('id', payment.invoice_id);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment updated successfully',
      data: updatedPayment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete payment
 */
exports.deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get payment before deletion - use admin client to bypass RLS
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const invoiceId = payment.invoice_id;

    // Delete payment - use admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('payments')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete payment'
      });
    }

    // Recalculate invoice totals - use admin client to bypass RLS
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoice) {
      const { data: allPayments } = await supabaseAdmin
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId);

      const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      const balanceDue = parseFloat(invoice.total_amount || 0) - totalPaid;

      const invoiceUpdate = {
        advance_paid: totalPaid,
        balance_due: balanceDue,
        updated_at: new Date().toISOString()
      };

      if (balanceDue <= 0 && totalPaid > 0) {
        invoiceUpdate.status = 'paid';
      } else if (totalPaid > 0) {
        invoiceUpdate.status = 'partial';
      } else {
        invoiceUpdate.status = 'sent';
      }

      await supabaseAdmin
        .from('invoices')
        .update(invoiceUpdate)
        .eq('id', invoiceId);
    }

    res.status(200).json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
