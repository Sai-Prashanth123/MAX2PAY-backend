const express = require('express');
const { protect, authorize } = require('../middleware/supabaseAuth');
const EnhancedInvoiceService = require('../services/enhancedInvoiceService');
const { createAuditLog } = require('../middleware/supabaseAuditLog');
const router = express.Router();

// Use enhanced service
const invoiceService = new EnhancedInvoiceService();

/**
 * Generate enhanced monthly invoice
 */
router.post('/generate-monthly-enhanced', protect, authorize('admin', 'employee'), async (req, res, next) => {
  try {
    const { clientId, month, year } = req.body;

    if (!clientId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Client ID, month, and year are required'
      });
    }

    const result = await invoiceService.generateMonthlyInvoice(
      clientId, 
      month, 
      year, 
      req.user.id
    );

    res.status(result.success ? 201 : 400).json(result);

  } catch (error) {
    console.error('Enhanced monthly invoice generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate enhanced monthly invoice'
    });
  }
});

/**
 * Get orders requiring manual billing
 */
router.get('/manual-billing-orders', protect, authorize('admin', 'employee'), async (req, res, next) => {
  try {
    const { clientId, status = 'manual_required' } = req.query;
    
    let query = req.supabaseAdmin
      .from('orders')
      .select(`
        *,
        clients:client_id (
          company_name
        )
      `)
      .eq('requires_manual_billing', true);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (status && status !== 'all') {
      query = query.eq('billing_status', status);
    }

    const { data: orders, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch manual billing orders'
      });
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Process manual billing for heavyweight orders
 */
router.post('/process-manual-billing', protect, authorize('admin', 'employee'), async (req, res, next) => {
  try {
    const { orderIds, billingType, baseCharge, perUnitCharge } = req.body;

    if (!orderIds || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order IDs are required'
      });
    }

    const results = {
      processed: [],
      failed: []
    };

    for (const orderId of orderIds) {
      try {
        // Create manual billing record
        const { data: order } = await req.supabaseAdmin
          .from('orders')
          .select('total_weight, total_amount')
          .eq('id', orderId)
          .single();

        if (!order) {
          results.failed.push({ orderId, error: 'Order not found' });
          continue;
        }

        const orderUnits = invoiceService.estimateOrderUnits(order);
        const totalCharge = parseFloat(baseCharge || 2.50) + 
          (parseFloat(perUnitCharge || 0.50) * orderUnits);

        await req.supabaseAdmin
          .from('manual_billing_orders')
          .insert({
            order_id: orderId,
            client_id: order.client_id,
            billing_type: billingType || 'weight_surcharge',
            base_charge: parseFloat(baseCharge || 2.50),
            per_unit_charge: parseFloat(perUnitCharge || 0.50),
            total_units: orderUnits,
            total_charge: totalCharge,
            created_by: req.user.id
          });

        // Update order status
        await req.supabaseAdmin
          .from('orders')
          .update({
            billing_status: 'manual_processed',
            requires_manual_billing: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        results.processed.push({ 
          orderId, 
          totalCharge,
          orderUnits 
        });

      } catch (error) {
        results.failed.push({ orderId, error: error.message });
      }
    }

    await createAuditLog(req.user.id, 'BULK_UPDATE', 'Order', null, { 
      processed: results.processed.length, 
      failed: results.failed.length 
    }, req);

    res.json({
      success: true,
      message: `Processed ${results.processed.length} manual billing records`,
      data: results
    });

  } catch (error) {
    console.error('Manual billing processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process manual billing'
    });
  }
});

/**
 * Get client billing preferences
 */
router.get('/client-billing-preferences/:clientId', protect, authorize('admin', 'employee'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    
    const billingPrefs = await invoiceService.getClientBillingPreference(clientId);
    
    res.json({
      success: true,
      data: billingPrefs
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Update client billing preferences
 */
router.put('/client-billing-preferences/:clientId', protect, authorize('admin', 'employee'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { billingPreference, taxRegion, taxRate, taxId } = req.body;

    const updateData = {};
    if (billingPreference) updateData.billing_preference = billingPreference;
    if (taxRegion) updateData.tax_region = taxRegion;
    if (taxRate !== undefined) updateData.tax_rate = parseFloat(taxRate);
    if (taxId) updateData.tax_id = taxId;

    const { data: client, error } = await req.supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .select('company_name, billing_preference, tax_region, tax_rate')
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to update billing preferences'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'Client', clientId, updateData, req);

    res.json({
      success: true,
      message: 'Billing preferences updated',
      data: client
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
