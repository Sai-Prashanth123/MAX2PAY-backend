const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const cloudinary = require('../config/cloudinary');
const { createAuditLog } = require('../middleware/supabaseAuditLog');
const { 
  computeBalanceDue, 
  deriveStatus, 
  normalizeInvoiceState 
} = require('../utils/invoiceStateValidator');

/**
 * Get all invoices
 */
exports.getAllInvoices = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, clientId, status, type } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Use admin client to bypass RLS and join with clients table
    let query = supabaseAdmin
      .from('invoices')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Filter by client
    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by type
    if (type) {
      query = query.eq('type', type);
    }

    const { data: invoices, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch invoices'
      });
    }

    // Format response - CRITICAL: Normalize each invoice to ensure correct computed values
    const formattedInvoices = (invoices || []).map(invoice => {
      // Always recompute balance_due and status from source of truth
      const normalized = normalizeInvoiceState(invoice);
      return {
      id: invoice.id,
      _id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientId: invoice.clients ? {
        _id: invoice.clients.id,
        id: invoice.clients.id,
        companyName: invoice.clients.company_name,
        email: invoice.clients.email
      } : { id: invoice.client_id, companyName: 'Unknown Client' },
      orderId: invoice.order_id,
      type: invoice.type,
      warehouse: invoice.warehouse,
      billingPeriod: invoice.billing_period_start_date || invoice.billing_period_end_date ? {
        startDate: invoice.billing_period_start_date,
        endDate: invoice.billing_period_end_date,
        month: invoice.billing_period_month,
        year: invoice.billing_period_year
      } : null,
      orderCount: invoice.order_count,
      ratePerOrder: parseFloat(invoice.rate_per_order || 0),
      lineItems: invoice.line_items || [],
      subtotal: parseFloat(invoice.subtotal || 0),
      amount: parseFloat(invoice.amount || 0),
      taxAmount: parseFloat(invoice.tax_amount || 0),
      taxRate: parseFloat(invoice.tax_rate || 0),
      totalAmount: parseFloat(invoice.total_amount || 0),
      paidAmount: parseFloat(invoice.paid_amount || 0),
      advancePaid: parseFloat(invoice.advance_paid || 0),
      balanceDue: parseFloat(normalized.balance_due),
      dueDate: invoice.due_date,
      paidDate: normalized.paid_date,
      status: normalized.status,
      fileUrl: invoice.file_url,
      notes: invoice.notes,
      uploadedBy: invoice.uploaded_by,
      createdAt: invoice.created_at,
      updatedAt: invoice.updated_at
    };
    });

    res.status(200).json({
      success: true,
      data: formattedInvoices,
      pagination: {
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get invoice by ID
 */
exports.getInvoiceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select(`
        *,
        clients:client_id (
          *
        ),
        orders:order_id (
          *
        ),
        user_profiles:uploaded_by (
          id,
          name,
          email
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Client authorization check
    if (req.user.role === 'client' && invoice.client_id !== req.user.client_id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this invoice'
      });
    }

    // CRITICAL: Normalize invoice to ensure correct computed values
    const normalized = normalizeInvoiceState(invoice);
    
    const formattedInvoice = {
      id: invoice.id,
      _id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientId: invoice.clients || invoice.client_id,
      orderId: invoice.orders || invoice.order_id,
      type: invoice.type,
      warehouse: invoice.warehouse,
      billingPeriod: invoice.billing_period_start_date || invoice.billing_period_end_date ? {
        startDate: invoice.billing_period_start_date,
        endDate: invoice.billing_period_end_date,
        month: invoice.billing_period_month,
        year: invoice.billing_period_year
      } : null,
      orderCount: invoice.order_count,
      ratePerOrder: parseFloat(invoice.rate_per_order || 0),
      lineItems: invoice.line_items || [],
      subtotal: parseFloat(invoice.subtotal || 0),
      amount: parseFloat(invoice.amount || 0),
      taxAmount: parseFloat(invoice.tax_amount || 0),
      taxRate: parseFloat(invoice.tax_rate || 0),
      totalAmount: parseFloat(invoice.total_amount || 0),
      paidAmount: parseFloat(invoice.paid_amount || 0),
      advancePaid: parseFloat(invoice.advance_paid || 0),
      balanceDue: parseFloat(normalized.balance_due),
      dueDate: invoice.due_date,
      paidDate: normalized.paid_date,
      status: normalized.status,
      fileUrl: invoice.file_url,
      notes: invoice.notes,
      uploadedBy: invoice.user_profiles ? {
        _id: invoice.user_profiles.id,
        name: invoice.user_profiles.name,
        email: invoice.user_profiles.email
      } : invoice.uploaded_by,
      createdAt: invoice.created_at,
      updatedAt: invoice.updated_at
    };

    res.status(200).json({
      success: true,
      data: formattedInvoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create invoice
 */
exports.createInvoice = async (req, res, next) => {
  try {
    const invoiceData = {
      ...req.body,
      uploaded_by: req.user.id
    };

    if (!invoiceData.invoice_number) {
      invoiceData.invoice_number = 'INV-' + Date.now();
    }

    // Ensure subtotal is set
    if (!invoiceData.subtotal) {
      invoiceData.subtotal = invoiceData.amount || 0;
    }

    // Map field names to Supabase schema
    const supabaseData = {
      invoice_number: invoiceData.invoice_number,
      client_id: invoiceData.clientId,
      order_id: invoiceData.orderId || null,
      type: invoiceData.type,
      warehouse: invoiceData.warehouse || 'Main Warehouse',
      billing_period_start_date: invoiceData.billingPeriod?.startDate || null,
      billing_period_end_date: invoiceData.billingPeriod?.endDate || null,
      billing_period_month: invoiceData.billingPeriod?.month || null,
      billing_period_year: invoiceData.billingPeriod?.year || null,
      order_count: invoiceData.orderCount || 0,
      rate_per_order: invoiceData.ratePerOrder || 2.25,
      line_items: invoiceData.lineItems || [],
      subtotal: invoiceData.subtotal,
      amount: invoiceData.amount || invoiceData.subtotal,
      tax_amount: invoiceData.taxAmount || 0,
      tax_rate: invoiceData.taxRate || 8,
      total_amount: invoiceData.totalAmount || invoiceData.subtotal,
      advance_paid: invoiceData.advancePaid || 0,
      balance_due: invoiceData.balanceDue || (invoiceData.totalAmount || invoiceData.subtotal),
      due_date: invoiceData.dueDate || null,
      status: invoiceData.status || 'draft',
      notes: invoiceData.notes || null,
      uploaded_by: req.user.id
    };

    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .insert(supabaseData)
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email,
          phone,
          address
        )
      `)
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create invoice'
      });
    }

    await createAuditLog(req.user.id, 'CREATE', 'Invoice', invoice.id, supabaseData, req);

    const formattedInvoice = {
      id: invoice.id,
      _id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientId: invoice.clients ? {
        _id: invoice.clients.id,
        companyName: invoice.clients.company_name
      } : invoice.client_id,
      orderId: invoice.orders ? {
        _id: invoice.orders.id,
        orderNumber: invoice.orders.order_number
      } : invoice.order_id,
      type: invoice.type,
      subtotal: parseFloat(invoice.subtotal || 0),
      amount: parseFloat(invoice.amount || 0),
      totalAmount: parseFloat(invoice.total_amount || 0),
      status: invoice.status,
      createdAt: invoice.created_at,
      updatedAt: invoice.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: formattedInvoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload invoice file
 */
exports.uploadInvoiceFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file'
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'invoices',
      resource_type: 'auto'
    });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Client authorization check
    if (req.user.role === 'client' && invoice.client_id !== req.user.client_id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this invoice'
      });
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ file_url: result.secure_url, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to update invoice'
      });
    }

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        fileUrl: result.secure_url
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update invoice
 */
exports.updateInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Client authorization check
    if (req.user.role === 'client' && invoice.client_id !== req.user.client_id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this invoice'
      });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Map update fields
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.dueDate !== undefined) updateData.due_date = req.body.dueDate;
    if (req.body.advancePaid !== undefined) updateData.advance_paid = req.body.advancePaid;
    if (req.body.balanceDue !== undefined) updateData.balance_due = req.body.balanceDue;
    if (req.body.paidDate !== undefined) updateData.paid_date = req.body.paidDate;

    const { data: updatedInvoice, error } = await supabaseAdmin
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update invoice'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'Invoice', invoice.id, updateData, req);

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: updatedInvoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete invoice
 */
exports.deleteInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const { error } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete invoice'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'Invoice', id, null, req);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate monthly invoice
 */
exports.generateMonthlyInvoice = async (req, res, next) => {
  try {
    const { clientId, month, year } = req.body;

    if (!clientId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Client ID, month, and year are required'
      });
    }

    // Check if client exists
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .maybeSingle();

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    // SMART DUPLICATE CHECK: Allow rebuilding incorrect invoices while protecting paid ones
    const { data: existingInvoice } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, status, total_amount, line_items')
      .eq('client_id', clientId)
      .eq('type', 'monthly')
      .eq('billing_period_month', month)
      .eq('billing_period_year', year)
      .maybeSingle();

    if (existingInvoice) {
      // PROTECTION: Cannot regenerate paid invoices
      if (existingInvoice.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: `Invoice ${existingInvoice.invoice_number} is already paid and cannot be regenerated`,
          code: 'INVOICE_PAID'
        });
      }

      // SAFE REBUILD: Delete incorrect unpaid invoice and regenerate
      console.log(`⚠️  Existing unpaid invoice found: ${existingInvoice.invoice_number} (${existingInvoice.status})`);
      console.log(`🔄 Deleting and rebuilding invoice with correct data...`);
      
      const { error: deleteError } = await supabaseAdmin
        .from('invoices')
        .delete()
        .eq('id', existingInvoice.id);

      if (deleteError) {
        console.error('Failed to delete existing invoice:', deleteError);
        return res.status(500).json({
          success: false,
          message: 'Failed to rebuild invoice: Could not delete existing invoice'
        });
      }

      console.log(`✅ Old invoice deleted, generating fresh invoice...`);
    }

    // CRITICAL FIX: Fetch billable orders using fulfillment dates (dispatched_at or delivered_at)
    // NOT created_at, because we bill based on when service was completed
    const { data: allOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['delivered', 'dispatched']);

    if (!allOrders || allOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No billable orders found for this period'
      });
    }

    // Filter orders by fulfillment date within billing period
    // This ensures we bill based on when the order was actually fulfilled, not created
    const orders = allOrders.filter(order => {
      const fulfillmentDate = order.delivered_at || order.dispatched_at;
      
      // Skip orders without fulfillment date
      if (!fulfillmentDate) {
        console.warn(`Order ${order.order_number} has no fulfillment date, skipping`);
        return false;
      }
      
      const fulfillmentTimestamp = new Date(fulfillmentDate).getTime();
      const startTimestamp = new Date(startDate).getTime();
      const endTimestamp = new Date(endDate).getTime();
      
      return fulfillmentTimestamp >= startTimestamp && fulfillmentTimestamp <= endTimestamp;
    });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No billable orders found for this period (orders may not have fulfillment dates set)'
      });
    }

    console.log(`📦 Found ${orders.length} billable orders for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`);

    // Calculate charge per order: $2.50 + (number_of_units - 1) × $1.25
    const BASE_RATE = 2.50;
    const ADDITIONAL_UNIT_RATE = 1.25;
    let totalAmount = 0;
    let totalUnits = 0;
    const orderCharges = [];

    // Detailed line items for invoice breakdown
    const detailedLineItems = [];

    for (const order of orders) {
      // Fetch order items with product details for detailed breakdown
      const { data: orderItems } = await supabaseAdmin
        .from('order_items')
        .select(`
          *,
          products:product_id (
            id,
            name,
            sku,
            category
          )
        `)
        .eq('order_id', order.id);

      // Calculate total units for this order
      const orderUnits = (orderItems || []).reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0);

      if (orderUnits > 0) {
        // Formula: $2.50 + (number_of_units - 1) × $1.25
        const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
        totalAmount += orderCharge;
        totalUnits += orderUnits;
        
        // Add each order item to detailed line items
        (orderItems || []).forEach(item => {
          detailedLineItems.push({
            sku: item.products?.sku || 'N/A',
            productName: item.products?.name || 'Unknown Product',
            orderNumber: order.order_number,
            orderDate: order.created_at,
            quantity: parseInt(item.quantity) || 0,
            unit: 'ORD',
            rate: Number((orderCharge / orderUnits).toFixed(2)),
            amount: Number(((orderCharge / orderUnits) * item.quantity).toFixed(2))
          });
        });

        orderCharges.push({
          orderNumber: order.order_number,
          units: orderUnits,
          charge: Number(orderCharge.toFixed(2))
        });
      }
    }

    if (totalAmount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No billable orders found (all orders have zero units)'
      });
    }

    // Create one line item per order for main invoice
    const lineItems = orderCharges.map(orderCharge => ({
      description: `Order Fulfillment – Order #${orderCharge.orderNumber}`,
      quantity: orderCharge.units,
      unitPrice: Number((orderCharge.charge / orderCharge.units).toFixed(2)),
      amount: orderCharge.charge,
      orderNumber: orderCharge.orderNumber,
      orderUnits: orderCharge.units
    }));

    // VALIDATION: Ensure all billable orders are included in the invoice
    if (lineItems.length !== orders.length) {
      console.error(`❌ VALIDATION FAILED: Found ${orders.length} billable orders but only ${lineItems.length} line items generated`);
      return res.status(500).json({
        success: false,
        message: `Invoice generation error: Expected ${orders.length} line items but got ${lineItems.length}. Some orders may have zero units.`,
        debug: {
          billableOrders: orders.length,
          lineItemsGenerated: lineItems.length,
          orderNumbers: orders.map(o => o.order_number)
        }
      });
    }

    console.log(`✅ Validation passed: ${lineItems.length} line items generated for ${orders.length} billable orders`);

    // Add detailed breakdown as metadata for page 2
    if (lineItems.length > 0) {
      lineItems[0].detailedBreakdown = detailedLineItems;
    }

    // No tax, no other fees
    const subtotal = Number(totalAmount.toFixed(2));
    const taxAmount = 0;
    const taxRate = 0;
    const finalTotalAmount = subtotal;

    const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoiceData = {
      invoice_number: invoiceNumber,
      client_id: clientId,
      type: 'monthly',
      billing_period_month: parseInt(month),
      billing_period_year: parseInt(year),
      billing_period_start_date: startDate,
      billing_period_end_date: endDate,
      line_items: lineItems,
      subtotal: subtotal,
      amount: subtotal,
      tax_amount: taxAmount,
      tax_rate: taxRate,
      total_amount: finalTotalAmount,
      balance_due: finalTotalAmount,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'sent',
      uploaded_by: req.user.id,
      notes: `Monthly invoice for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`
    };

    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .insert(invoiceData)
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email,
          contact_person
        ),
        user_profiles:uploaded_by (
          id,
          name
        )
      `)
      .maybeSingle();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create invoice'
      });
    }

    await createAuditLog(req.user.id, 'CREATE', 'Invoice', invoice.id, invoiceData, req);

    const wasRebuilt = !!existingInvoice;
    const message = wasRebuilt 
      ? `Invoice rebuilt successfully with ${orders.length} orders (previous invoice was incorrect)`
      : `Monthly invoice generated successfully with ${orders.length} orders`;

    res.status(201).json({
      success: true,
      message: message,
      data: invoice,
      meta: {
        rebuilt: wasRebuilt,
        orderCount: orders.length,
        totalAmount: finalTotalAmount
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Rebuild Monthly Invoice (Admin Only)
 * Allows manual correction of incorrect invoices
 * Cannot rebuild paid invoices - only draft/sent/overdue
 */
exports.rebuildMonthlyInvoice = async (req, res, next) => {
  try {
    const { clientId, month, year } = req.body;

    if (!clientId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Client ID, month, and year are required'
      });
    }

    // Fetch existing invoice
    const { data: existingInvoice } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, status, total_amount')
      .eq('client_id', clientId)
      .eq('type', 'monthly')
      .eq('billing_period_month', month)
      .eq('billing_period_year', year)
      .maybeSingle();

    if (!existingInvoice) {
      return res.status(404).json({
        success: false,
        message: 'No invoice found for this period. Use generate instead of rebuild.'
      });
    }

    // PROTECTION: Cannot rebuild paid invoices
    if (existingInvoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: `Invoice ${existingInvoice.invoice_number} is already paid and cannot be rebuilt`,
        code: 'INVOICE_PAID'
      });
    }

    console.log(`🔧 Manual rebuild requested for invoice ${existingInvoice.invoice_number}`);
    console.log(`   Old amount: $${existingInvoice.total_amount}`);

    // Delete old invoice
    const { error: deleteError } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', existingInvoice.id);

    if (deleteError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete existing invoice for rebuild'
      });
    }

    // Reuse the generation logic by calling generateMonthlyInvoice
    req.body = { clientId, month, year };
    return exports.generateMonthlyInvoice(req, res, next);

  } catch (error) {
    next(error);
  }
};

/**
 * Generate bulk monthly invoices
 */
exports.generateBulkMonthlyInvoices = async (req, res, next) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, company_name')
      .eq('is_active', true);

    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    for (const client of clients || []) {
      try {
        // Check if invoice already exists
        const { data: existingInvoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('client_id', client.id)
          .eq('type', 'monthly')
          .eq('billing_period_month', month)
          .eq('billing_period_year', year)
          .maybeSingle();

        if (existingInvoice) {
          results.skipped.push({
            clientId: client.id,
            clientName: client.company_name,
            reason: 'Invoice already exists'
          });
          continue;
        }

        // Get orders for this client - only orders up to 5 lbs
        const { data: allOrders } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('client_id', client.id)
          .in('status', ['delivered', 'dispatched'])
          .gte('created_at', startDate)
          .lte('created_at', endDate);

        // Include all orders (no weight filter)
        const orders = allOrders || [];

        if (!orders || orders.length === 0) {
          results.skipped.push({
            clientId: client.id,
            clientName: client.company_name,
            reason: 'No billable orders'
          });
          continue;
        }

        // Calculate charge per order: $2.50 + (number_of_units - 1) × $1.25
        const BASE_RATE = 2.50;
        const ADDITIONAL_UNIT_RATE = 1.25;
        let totalAmount = 0;
        let totalUnits = 0;
        const orderCharges = [];
        const detailedLineItems = [];

        for (const order of orders) {
          // Fetch order items with product details
          const { data: orderItems } = await supabaseAdmin
            .from('order_items')
            .select(`
              *,
              products:product_id (
                id,
                name,
                sku,
                category
              )
            `)
            .eq('order_id', order.id);

          // Calculate total units for this order
          const orderUnits = (orderItems || []).reduce((sum, item) => {
            return sum + (parseInt(item.quantity) || 0);
          }, 0);

          if (orderUnits > 0) {
            // Formula: $2.50 + (number_of_units - 1) × $1.25
            const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
            totalAmount += orderCharge;
            totalUnits += orderUnits;

            // Add each order item to detailed line items
            (orderItems || []).forEach(item => {
              detailedLineItems.push({
                sku: item.products?.sku || 'N/A',
                productName: item.products?.name || 'Unknown Product',
                orderNumber: order.order_number,
                orderDate: order.created_at,
                quantity: parseInt(item.quantity) || 0,
                unit: 'ORD',
                rate: Number((orderCharge / orderUnits).toFixed(2)),
                amount: Number(((orderCharge / orderUnits) * item.quantity).toFixed(2))
              });
            });

            orderCharges.push({
              orderNumber: order.order_number,
              units: orderUnits,
              charge: Number(orderCharge.toFixed(2))
            });
          }
        }

        if (totalAmount === 0) {
          results.skipped.push({
            clientId: client.id,
            clientName: client.company_name,
            reason: 'No billable orders (all orders have zero units)'
          });
          continue;
        }

        // Create one line item per order
        const lineItems = orderCharges.map(orderCharge => ({
          description: `Order Fulfillment – Order #${orderCharge.orderNumber}`,
          quantity: orderCharge.units,
          unitPrice: Number((orderCharge.charge / orderCharge.units).toFixed(2)),
          amount: orderCharge.charge,
          orderNumber: orderCharge.orderNumber,
          orderUnits: orderCharge.units
        }));

        // Add detailed breakdown as metadata for page 2
        if (lineItems.length > 0) {
          lineItems[0].detailedBreakdown = detailedLineItems;
        }

        // No tax, no other fees
        const subtotal = Number(totalAmount.toFixed(2));
        const taxAmount = 0;
        const taxRate = 0;

        const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${client.id.slice(-6).toUpperCase()}`;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const invoiceData = {
          invoice_number: invoiceNumber,
          client_id: client.id,
          type: 'monthly',
          billing_period_month: parseInt(month),
          billing_period_year: parseInt(year),
          billing_period_start_date: startDate,
          billing_period_end_date: endDate,
          line_items: lineItems,
          subtotal: subtotal,
          amount: subtotal,
          tax_amount: taxAmount,
          tax_rate: taxRate,
          total_amount: totalAmount,
          balance_due: totalAmount,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'sent',
          uploaded_by: req.user.id,
          notes: `Monthly invoice for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`
        };

        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .insert(invoiceData)
          .select('invoice_number, total_amount')
          .maybeSingle();

        if (invoiceError) {
          results.failed.push({
            clientId: client.id,
            clientName: client.company_name,
            error: invoiceError.message
          });
        } else {
          await createAuditLog(req.user.id, 'CREATE', 'Invoice', invoice.id, invoiceData, req);
          results.success.push({
            clientId: client.id,
            clientName: client.company_name,
            invoiceNumber: invoice.invoice_number,
            totalAmount: invoice.total_amount
          });
        }
      } catch (error) {
        results.failed.push({
          clientId: client.id,
          clientName: client.company_name,
          error: error.message
        });
      }
    }

    // Determine appropriate message and status
    let message = '';
    if (results.success.length > 0) {
      message = `Generated ${results.success.length} invoice${results.success.length > 1 ? 's' : ''} successfully`;
      if (results.skipped.length > 0) {
        message += `, skipped ${results.skipped.length} client${results.skipped.length > 1 ? 's' : ''}`;
      }
    } else if (results.skipped.length > 0) {
      message = `No new invoices generated. ${results.skipped.length} client${results.skipped.length > 1 ? 's' : ''} skipped (already have invoices or no billable orders)`;
    } else {
      message = 'No invoices generated';
    }

    res.status(200).json({
      success: true,
      message: message,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate fulfillment invoice
 */
exports.generateFulfillmentInvoice = async (req, res, next) => {
  try {
    const { clientId, warehouse, startDate, endDate, ratePerOrder, advancePaid } = req.body;

    if (!clientId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Client, start date, and end date are required'
      });
    }

    // Check if client exists
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .maybeSingle();

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Pricing formula: $2.50 + (number_of_units - 1) × $1.25 per order
    const BASE_RATE = 2.50;
    const ADDITIONAL_UNIT_RATE = 1.25;

    // Get orders in date range - only orders up to 5 lbs
    const { data: allOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('client_id', clientId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    // Include all orders (no weight filter)
    const orders = allOrders || [];

    if (!orders || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No billable orders found for the specified date range'
      });
    }

    // Calculate charge per order: $2.50 + (number_of_units - 1) × $1.25
    let totalAmount = 0;
    let totalUnits = 0;

    for (const order of orders) {
      // Fetch order items to get total units
      const { data: orderItems } = await supabaseAdmin
        .from('order_items')
        .select('quantity')
        .eq('order_id', order.id);

      // Calculate total units for this order
      const orderUnits = (orderItems || []).reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0);

      if (orderUnits > 0) {
        // Formula: $2.50 + (number_of_units - 1) × $1.25
        const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
        totalAmount += orderCharge;
        totalUnits += orderUnits;
      }
    }

    if (totalAmount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No billable orders found (all orders have zero units)'
      });
    }

    const orderCount = orders.length;
    const subtotal = Number(totalAmount.toFixed(2));
    const taxRate = 0;
    const taxAmount = 0;
    const finalTotalAmount = subtotal;
    const advance = advancePaid || 0;
    const balanceDue = finalTotalAmount - advance;
    const avgRatePerOrder = Number((totalAmount / orderCount).toFixed(2));

    // Get invoice count for number generation
    const { count: invoiceCount } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact', head: true });

    const invoiceNumber = `INV-${Date.now()}-${String((invoiceCount || 0) + 1).padStart(4, '0')}`;

    // Create single line item for all orders
    const lineItems = [{
      description: `Order Fulfillment (${orderCount} orders, ${totalUnits} total units)`,
      quantity: orderCount,
      unitPrice: avgRatePerOrder,
      amount: subtotal
    }];

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoiceData = {
      invoice_number: invoiceNumber,
      client_id: clientId,
      type: 'fulfillment',
      warehouse: warehouse || 'Main Warehouse',
      billing_period_start_date: startDate.split('T')[0],
      billing_period_end_date: endDate.split('T')[0],
      order_count: orderCount,
      rate_per_order: avgRatePerOrder,
      line_items: lineItems,
      subtotal,
      amount: subtotal,
      tax_amount: taxAmount,
      tax_rate: taxRate,
      total_amount: finalTotalAmount,
      advance_paid: advance,
      balance_due: balanceDue,
      due_date: dueDate.toISOString().split('T')[0],
      status: advance >= finalTotalAmount ? 'paid' : (advance > 0 ? 'partial' : 'sent'),
      uploaded_by: req.user.id,
      notes: `Fulfillment invoice for ${orderCount} orders from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
    };

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert(invoiceData)
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        ),
        user_profiles:generated_by (
          id,
          name,
          email
        )
      `)
      .single();

    if (invoiceError) {
      return res.status(400).json({
        success: false,
        message: invoiceError.message || 'Failed to create invoice'
      });
    }

    // Record advance payment if provided
    if (advance > 0) {
      await supabase
        .from('payments')
        .insert({
          invoice_id: invoice.id,
          client_id: clientId,
          amount: advance,
          payment_date: new Date().toISOString(),
          payment_method: 'advance',
          notes: 'Advance payment recorded during invoice generation',
          recorded_by: req.user.id
        });
    }

    await createAuditLog(req.user.id, 'CREATE', 'Invoice', invoice.id, invoiceData, req);

    res.status(201).json({
      success: true,
      message: 'Fulfillment invoice generated successfully',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};
