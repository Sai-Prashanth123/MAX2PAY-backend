const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Reusable Invoice Generation Service
 * Extracted from manual generation to be used by both manual and automated processes
 */

/**
 * Generate a monthly invoice for a specific client and billing period
 * @param {string} clientId - Client UUID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (e.g., 2026)
 * @param {string} userId - User ID who triggered generation (for audit)
 * @param {boolean} isDraft - Whether to create as draft (true for auto-generation)
 * @returns {Promise<Object>} Generated invoice data or error
 */
exports.generateMonthlyInvoice = async (clientId, month, year, userId, isDraft = false) => {
  try {
    // Calculate billing period dates
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59)).toISOString();

    // Check if invoice already exists (idempotency)
    const { data: existingInvoice } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('client_id', clientId)
      .eq('type', 'monthly')
      .eq('billing_period_month', month)
      .eq('billing_period_year', year)
      .maybeSingle();

    if (existingInvoice) {
      return {
        success: false,
        skipped: true,
        reason: 'duplicate',
        message: `Invoice already exists: ${existingInvoice.invoice_number}`,
        existingInvoice
      };
    }

    // Fetch billable orders using fulfillment dates (dispatched_at or delivered_at)
    // This ensures we bill based on when service was completed, not when order was created
    const { data: allOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['delivered', 'dispatched']);

    // Filter orders by fulfillment date within billing period
    const orders = (allOrders || []).filter(order => {
      const fulfillmentDate = order.delivered_at || order.dispatched_at;
      if (!fulfillmentDate) return false;
      
      const fulfillmentTimestamp = new Date(fulfillmentDate).getTime();
      const startTimestamp = new Date(startDate).getTime();
      const endTimestamp = new Date(endDate).getTime();
      
      return fulfillmentTimestamp >= startTimestamp && fulfillmentTimestamp <= endTimestamp;
    });

    // If no billable orders, skip invoice generation
    if (!orders || orders.length === 0) {
      return {
        success: false,
        skipped: true,
        reason: 'no_orders',
        message: 'No billable orders found for this period'
      };
    }

    // Pricing constants
    const BASE_RATE = 2.50;
    const ADDITIONAL_UNIT_RATE = 1.25;
    let totalAmount = 0;
    let totalUnits = 0;
    const orderCharges = [];
    const detailedLineItems = [];

    // Calculate charges for each order
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
        // Apply pricing formula: $2.50 + (units - 1) × $1.25
        const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
        totalAmount += orderCharge;
        totalUnits += orderUnits;
        
        // Build detailed line items for PDF breakdown
        (orderItems || []).forEach(item => {
          detailedLineItems.push({
            sku: item.products?.sku || 'N/A',
            productName: item.products?.name || 'Unknown Product',
            orderNumber: order.order_number,
            orderDate: order.delivered_at || order.dispatched_at || order.created_at,
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

    // Final validation
    if (totalAmount === 0) {
      return {
        success: false,
        skipped: true,
        reason: 'zero_amount',
        message: 'No billable orders found (all orders have zero units)'
      };
    }

    // Build line items (one per order)
    const lineItems = orderCharges.map(orderCharge => ({
      description: `Order Fulfillment – Order #${orderCharge.orderNumber}`,
      quantity: orderCharge.units,
      unitPrice: Number((orderCharge.charge / orderCharge.units).toFixed(2)),
      amount: orderCharge.charge,
      orderNumber: orderCharge.orderNumber,
      orderUnits: orderCharge.units
    }));

    // Attach detailed breakdown for PDF generation
    if (lineItems.length > 0) {
      lineItems[0].detailedBreakdown = detailedLineItems;
    }

    // Calculate totals (no tax)
    const subtotal = Number(totalAmount.toFixed(2));
    const taxAmount = 0;
    const taxRate = 0;
    const finalTotalAmount = subtotal;

    // Generate invoice number
    const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;

    // Calculate due date (billing period end + 30 days)
    const billingEndDate = new Date(endDate);
    const dueDate = new Date(billingEndDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // Prepare invoice data
    const invoiceData = {
      invoice_number: invoiceNumber,
      client_id: clientId,
      type: 'monthly',
      billing_period_month: parseInt(month),
      billing_period_year: parseInt(year),
      billing_period_start_date: startDate,
      billing_period_end_date: endDate,
      order_count: orders.length,
      line_items: lineItems,
      subtotal: subtotal,
      amount: subtotal,
      tax_amount: taxAmount,
      tax_rate: taxRate,
      total_amount: finalTotalAmount,
      balance_due: finalTotalAmount,
      due_date: dueDate.toISOString().split('T')[0],
      status: isDraft ? 'draft' : 'sent',
      uploaded_by: userId,
      notes: `Monthly invoice for ${getMonthName(month)} ${year}. Generated ${isDraft ? 'automatically' : 'manually'}.`
    };

    // CRITICAL: Use transaction to ensure atomicity
    // Invoice creation and order locking must succeed together or fail together
    let invoice = null;
    
    try {
      // Step 1: Insert invoice into database
      const { data: invoiceData, error: invoiceError } = await supabaseAdmin
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) {
        throw new Error(`Failed to create invoice: ${invoiceError.message}`);
      }

      invoice = invoiceData;

      // Step 2: Link orders to invoice using UUID (not string)
      // IMPORTANT: Orders are locked by invoice_id, but lock is enforced based on invoice STATUS
      // Draft invoices do NOT lock orders (allows corrections before sending)
      // Orders become locked only when invoice status is 'sent', 'partial', or 'paid'
      const orderIds = orders.map(o => o.id);
      const { error: lockError } = await supabaseAdmin
        .from('orders')
        .update({ 
          invoice_id: invoice.id,  // UUID foreign key (immutable)
          invoiced_in: invoiceNumber  // Keep for backward compatibility (will be removed)
        })
        .in('id', orderIds);

      if (lockError) {
        // ROLLBACK: Delete the invoice if order locking fails
        console.error(`❌ Failed to link orders to invoice ${invoiceNumber}. Rolling back...`);
        await supabaseAdmin
          .from('invoices')
          .delete()
          .eq('id', invoice.id);
        
        throw new Error(`Transaction failed: Could not link orders to invoice. ${lockError.message}`);
      }

      // Step 3: Create audit trail for order locking
      const lockAuditRecords = orderIds.map(orderId => ({
        order_id: orderId,
        invoice_id: invoice.id,
        locked_by: userId,
        invoice_status: invoice.status
      }));

      await supabaseAdmin
        .from('order_lock_audit')
        .insert(lockAuditRecords);

      const lockStatus = invoice.status === 'draft' 
        ? 'linked (editable until sent)' 
        : 'locked (immutable)';
      
      console.log(`✅ ${orderIds.length} orders ${lockStatus} to invoice ${invoiceNumber}`);

    } catch (transactionError) {
      // If we got here, transaction failed
      // Invoice may or may not exist - ensure cleanup
      if (invoice?.id) {
        await supabaseAdmin
          .from('invoices')
          .delete()
          .eq('id', invoice.id);
      }
      
      throw new Error(`Invoice generation transaction failed: ${transactionError.message}`);
    }

    return {
      success: true,
      data: invoice,
      message: `Invoice ${invoiceNumber} generated successfully`,
      stats: {
        orderCount: orders.length,
        totalUnits: totalUnits,
        totalAmount: finalTotalAmount,
        ordersLocked: !lockError
      }
    };

  } catch (error) {
    return {
      success: false,
      error: true,
      message: error.message || 'Failed to generate invoice',
      stack: error.stack
    };
  }
};

/**
 * Get month name from number
 */
const getMonthName = (month) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || month;
};
