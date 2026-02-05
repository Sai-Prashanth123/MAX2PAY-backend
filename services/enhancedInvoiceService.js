const supabase = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Enhanced Invoice Service for USA Compliance
 * Handles weight-based billing, delivery policies, and tax framework
 */

class EnhancedInvoiceService {
  constructor() {
    this.WEIGHT_THRESHOLD = 5; // lbs
    this.WEIGHT_SURCHARGE_RATE = 5.00; // flat fee for orders > 5lbs
    this.PER_UNIT_SURCHARGE = 0.50; // per unit charge for orders > 5lbs
  }

  /**
   * Determine order billing category
   */
  categorizeOrder(order) {
    const weight = parseFloat(order.total_weight || 0);
    
    if (weight <= this.WEIGHT_THRESHOLD) {
      return {
        category: 'standard',
        billable: true,
        weightCategory: 'standard',
        billingMethod: 'automatic'
      };
    } else {
      return {
        category: 'heavyweight',
        billable: true,
        weightCategory: 'heavyweight',
        billingMethod: 'manual',
        requiresManualBilling: true
      };
    }
  }

  /**
   * Get client billing preference
   */
  async getClientBillingPreference(clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('billing_preference, tax_region, tax_rate, tax_id, currency')
      .eq('id', clientId)
      .single();

    return {
      preference: client?.billing_preference || 'delivery',
      taxRegion: client?.tax_region || 'US',
      taxRate: parseFloat(client?.tax_rate || '8.00'),
      taxId: client?.tax_id || null,
      currency: client?.currency || 'USD'
    };
  }

  /**
   * Calculate standard fulfillment charges (≤5lbs)
   */
  calculateStandardFulfillment(orders) {
    const BASE_RATE = 2.50;
    const ADDITIONAL_UNIT_RATE = 1.25;
    let totalAmount = 0;
    let totalUnits = 0;

    for (const order of orders) {
      const orderUnits = this.calculateOrderUnits(order);
      if (orderUnits > 0) {
        const orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
        totalAmount += orderCharge;
        totalUnits += orderUnits;
      }
    }

    return {
      type: 'standard',
      totalAmount: Number(totalAmount.toFixed(2)),
      totalUnits,
      orderCount: orders.length,
      breakdown: orders.map(order => ({
        orderId: order.id,
        orderNumber: order.order_number,
        units: this.calculateOrderUnits(order),
        charge: BASE_RATE + ((this.calculateOrderUnits(order) - 1) * ADDITIONAL_UNIT_RATE)
      }))
    };
  }

  /**
   * Calculate heavyweight fulfillment charges (>5lbs)
   */
  calculateHeavyweightFulfillment(orders) {
    let totalAmount = 0;
    let totalUnits = 0;

    for (const order of orders) {
      const orderUnits = this.calculateOrderUnits(order);
      if (orderUnits > 0) {
        // Base charge + weight surcharge + per-unit charge
        const baseCharge = 2.50;
        const weightSurcharge = this.WEIGHT_SURCHARGE_RATE;
        const unitCharge = this.PER_UNIT_SURCHARGE * orderUnits;
        const orderCharge = baseCharge + weightSurcharge + unitCharge;
        
        totalAmount += orderCharge;
        totalUnits += orderUnits;
      }
    }

    return {
      type: 'heavyweight',
      totalAmount: Number(totalAmount.toFixed(2)),
      totalUnits,
      orderCount: orders.length,
      breakdown: orders.map(order => ({
        orderId: order.id,
        orderNumber: order.order_number,
        units: this.calculateOrderUnits(order),
        charge: 2.50 + this.WEIGHT_SURCHARGE_RATE + (this.PER_UNIT_SURCHARGE * this.calculateOrderUnits(order))
      })),
      weightSurcharge: this.WEIGHT_SURCHARGE_RATE,
      perUnitSurcharge: this.PER_UNIT_SURCHARGE
    };
  }

  /**
   * Calculate order units from order_items
   */
  async calculateOrderUnits(order) {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('quantity')
      .eq('order_id', order.id);

    return (orderItems || []).reduce((sum, item) => {
      return sum + (parseInt(item.quantity) || 0);
    }, 0);
  }

  /**
   * Generate monthly invoice with enhanced logic
   */
  async generateMonthlyInvoice(clientId, month, year, userId) {
    try {
      // Get client billing preferences
      const billingPrefs = await this.getClientBillingPreference(clientId);
      
      // Define date range
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      // Get all orders in date range
      const { data: allOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .in('status', ['delivered', 'dispatched'])
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      // Categorize orders
      const standardOrders = [];
      const heavyweightOrders = [];

      for (const order of allOrders || []) {
        const category = this.categorizeOrder(order);
        
        if (category.category === 'standard') {
          standardOrders.push(order);
        } else {
          heavyweightOrders.push(order);
          // Mark order as requiring manual billing
          await this.markOrderForManualBilling(order.id, userId);
        }
      }

      // Check for duplicate invoice
      const existingInvoice = await this.checkExistingInvoice(clientId, month, year);
      if (existingInvoice) {
        throw new Error(`Invoice for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })} already exists`);
      }

      let invoiceData = {
        invoice_number: this.generateInvoiceNumber(clientId, month, year),
        client_id: clientId,
        type: 'monthly',
        billing_period_start_date: startDate.split('T')[0],
        billing_period_end_date: endDate.split('T')[0],
        billing_period_month: parseInt(month),
        billing_period_year: parseInt(year),
        currency: billingPrefs.currency,
        tax_region: billingPrefs.taxRegion,
        tax_rate: billingPrefs.taxRate,
        tax_id: billingPrefs.taxId,
        status: 'draft',
        generated_by: userId,
        notes: `Monthly invoice for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`
      };

      if (standardOrders.length > 0) {
        const standardCalc = this.calculateStandardFulfillment(standardOrders);
        
        // Create manual billing records for heavyweight orders
        if (heavyweightOrders.length > 0) {
          await this.createManualBillingRecords(heavyweightOrders, clientId, userId);
        }

        // Combine calculations
        const combinedTotal = standardCalc.totalAmount + 
          (heavyweightOrders.length * this.WEIGHT_SURCHARGE_RATE) + 
          (this.calculateHeavyweightFulfillment(heavyweightOrders).totalAmount - 
           (heavyweightOrders.length * 2.50)); // Subtract base charges, add weight+unit charges

        invoiceData = {
          ...invoiceData,
          subtotal: combinedTotal,
          amount: combinedTotal,
          tax_amount: combinedTotal * (billingPrefs.taxRate / 100),
          total_amount: combinedTotal * (1 + billingPrefs.taxRate / 100),
          line_items: JSON.stringify([
            ...standardCalc.breakdown,
            {
              description: `Standard fulfillment (${standardOrders.length} orders, ${standardCalc.totalUnits} units)`,
              quantity: standardOrders.length,
              unitPrice: Number((standardCalc.totalAmount / standardOrders.length).toFixed(2)),
              amount: standardCalc.totalAmount
            }
          ]),
          order_count: standardOrders.length + heavyweightOrders.length,
          notes: `${invoiceData.notes}. Heavyweight orders: ${heavyweightOrders.length} require separate billing.`
        };
      }

      // Create invoice
      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select(`
          *,
          clients:client_id (
            company_name,
            billing_preference
          )
        `)
        .single();

      if (error) {
        throw new Error(`Failed to create invoice: ${error.message}`);
      }

      // Create order references for transparency
      await this.createOrderReferences(invoice.id, [...standardOrders, ...heavyweightOrders]);

      // Log audit
      await createAuditLog(userId, 'CREATE', 'Invoice', invoice.id, invoiceData, null);

      return {
        success: true,
        data: {
          ...invoice,
          clients: invoice.clients,
          heavyweightOrdersProcessed: heavyweightOrders.length,
          standardOrdersProcessed: standardOrders.length,
          requiresManualBilling: heavyweightOrders.length > 0
        }
      };

    } catch (error) {
      console.error('Enhanced invoice generation error:', error);
      throw error;
    }
  }

  /**
   * Generate invoice number
   */
  generateInvoiceNumber(clientId, month, year) {
    return `INV-${year}${String(month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;
  }

  /**
   * Check for existing invoice
   */
  async checkExistingInvoice(clientId, month, year) {
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('client_id', clientId)
      .eq('type', 'monthly')
      .eq('billing_period_month', parseInt(month))
      .eq('billing_period_year', parseInt(year))
      .single();

    return existing;
  }

  /**
   * Mark order for manual billing
   */
  async markOrderForManualBilling(orderId, userId) {
    await supabase
      .from('orders')
      .update({ 
        requires_manual_billing: true,
        billing_status: 'manual_required',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    await createAuditLog(userId, 'UPDATE', 'Order', orderId, { requires_manual_billing: true }, null);
  }

  /**
   * Create manual billing records
   */
  async createManualBillingRecords(orders, clientId, userId) {
    for (const order of orders) {
      const orderUnits = await this.calculateOrderUnits(order);
      
      await supabase
        .from('manual_billing_orders')
        .insert({
          order_id: order.id,
          client_id: clientId,
          billing_type: 'weight_surcharge',
          base_charge: 2.50,
          per_unit_charge: this.PER_UNIT_SURCHARGE,
          total_units: orderUnits,
          total_charge: this.WEIGHT_SURCHARGE_RATE + (this.PER_UNIT_SURCHARGE * orderUnits),
          created_by: userId
        });
    }
  }

  /**
   * Create order references for invoice transparency
   */
  async createOrderReferences(invoiceId, orders) {
    for (const order of orders) {
      await supabase
        .from('invoice_order_references')
        .insert({
          invoice_id: invoiceId,
          order_id: order.id,
          order_number: order.order_number,
          order_total: parseFloat(order.total_amount || 0),
          billing_amount: this.calculateOrderBillingAmount(order)
        });
    }
  }

  /**
   * Calculate order billing amount
   */
  calculateOrderBillingAmount(order) {
    const weight = parseFloat(order.total_weight || 0);
    const units = this.estimateOrderUnits(order);
    
    if (weight <= this.WEIGHT_THRESHOLD) {
      // Standard calculation
      const BASE_RATE = 2.50;
      const ADDITIONAL_UNIT_RATE = 1.25;
      return BASE_RATE + ((units - 1) * ADDITIONAL_UNIT_RATE);
    } else {
      // Heavyweight calculation
      return 2.50 + this.WEIGHT_SURCHARGE_RATE + (this.PER_UNIT_SURCHARGE * units);
    }
  }

  /**
   * Estimate order units (fallback calculation)
   */
  estimateOrderUnits(order) {
    // Fallback: estimate from order total or weight
    const totalAmount = parseFloat(order.total_amount || 0);
    const weight = parseFloat(order.total_weight || 0);
    
    // Rough estimation: assume average $3 per unit
    return Math.round(totalAmount / 3);
  }
}

module.exports = EnhancedInvoiceService;
