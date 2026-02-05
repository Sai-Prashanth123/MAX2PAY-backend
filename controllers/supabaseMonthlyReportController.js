const supabaseAdmin = require('../config/supabaseAdmin');
const { Parser } = require('json2csv');

const BASE_RATE = 2.50;
const ADDITIONAL_UNIT_RATE = 1.25;

/**
 * Get Monthly Invoice Report for All Clients
 * Shows all invoices for a specific month with detailed calculations
 */
exports.getMonthlyInvoiceReport = async (req, res, next) => {
  try {
    const { month, year, format = 'json' } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    // Get all invoices for the specified month
    const startDate = new Date(yearNum, monthNum - 1, 1).toISOString();
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString();

    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email,
          contact_person
        )
      `)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch monthly report'
      });
    }

    // Group invoices by client
    const clientInvoices = {};
    let totalRevenue = 0;
    let totalInvoices = 0;
    let totalOrders = 0;
    let totalUnits = 0;

    for (const invoice of invoices || []) {
      const clientId = invoice.client_id;
      const clientName = invoice.clients?.company_name || 'Unknown Client';
      
      if (!clientInvoices[clientId]) {
        clientInvoices[clientId] = {
          clientId,
          clientName,
          clientEmail: invoice.clients?.email || '',
          contactPerson: invoice.clients?.contact_person || '',
          invoices: [],
          totalAmount: 0,
          invoiceCount: 0
        };
      }

      // Calculate units from line items
      let invoiceUnits = 0;
      let invoiceOrders = 0;
      
      if (invoice.line_items && Array.isArray(invoice.line_items)) {
        invoice.line_items.forEach(item => {
          invoiceUnits += parseInt(item.quantity) || 0;
        });
      }

      // If it's a monthly or fulfillment invoice, get order count from notes or line items
      if (invoice.type === 'monthly' || invoice.type === 'fulfillment') {
        // Extract order count from line items description
        const lineItem = invoice.line_items?.[0];
        if (lineItem?.description) {
          const match = lineItem.description.match(/(\d+)\s+orders/);
          if (match) {
            invoiceOrders = parseInt(match[1]);
          }
        }
      } else if (invoice.order_id) {
        invoiceOrders = 1; // Single order invoice
      }

      const invoiceAmount = parseFloat(invoice.total_amount || 0);

      clientInvoices[clientId].invoices.push({
        invoiceNumber: invoice.invoice_number,
        type: invoice.type,
        amount: invoiceAmount,
        units: invoiceUnits,
        orders: invoiceOrders,
        status: invoice.status,
        dueDate: invoice.due_date,
        createdAt: invoice.created_at
      });

      clientInvoices[clientId].totalAmount += invoiceAmount;
      clientInvoices[clientId].invoiceCount += 1;

      totalRevenue += invoiceAmount;
      totalInvoices += 1;
      totalOrders += invoiceOrders;
      totalUnits += invoiceUnits;
    }

    // Convert to array and sort by total amount
    const clientReports = Object.values(clientInvoices).sort((a, b) => b.totalAmount - a.totalAmount);

    const reportData = {
      period: {
        month: monthNum,
        year: yearNum,
        monthName: new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' }),
        startDate,
        endDate
      },
      summary: {
        totalClients: clientReports.length,
        totalInvoices,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders,
        totalUnits,
        averageInvoiceAmount: totalInvoices > 0 ? Number((totalRevenue / totalInvoices).toFixed(2)) : 0,
        averageRevenuePerClient: clientReports.length > 0 ? Number((totalRevenue / clientReports.length).toFixed(2)) : 0
      },
      clients: clientReports,
      pricingFormula: {
        baseRate: BASE_RATE,
        additionalUnitRate: ADDITIONAL_UNIT_RATE,
        formula: `$${BASE_RATE} + (units - 1) × $${ADDITIONAL_UNIT_RATE}`
      }
    };

    if (format === 'csv') {
      // Flatten data for CSV export
      const csvData = [];
      
      clientReports.forEach(client => {
        client.invoices.forEach(invoice => {
          csvData.push({
            'Client Name': client.clientName,
            'Client Email': client.clientEmail,
            'Contact Person': client.contactPerson,
            'Invoice Number': invoice.invoiceNumber,
            'Type': invoice.type,
            'Orders': invoice.orders,
            'Units': invoice.units,
            'Amount': `$${invoice.amount.toFixed(2)}`,
            'Status': invoice.status,
            'Due Date': invoice.dueDate,
            'Created Date': new Date(invoice.createdAt).toLocaleDateString()
          });
        });
      });

      const fields = [
        'Client Name', 'Client Email', 'Contact Person',
        'Invoice Number', 'Type', 'Orders', 'Units',
        'Amount', 'Status', 'Due Date', 'Created Date'
      ];

      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment(`monthly-invoice-report-${yearNum}-${String(monthNum).padStart(2, '0')}.csv`);
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: reportData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Client-Specific Monthly Report
 * Detailed breakdown for a single client
 */
exports.getClientMonthlyReport = async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    // Get client info
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get all orders for this client in the month
    const startDate = new Date(yearNum, monthNum - 1, 1).toISOString();
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString();

    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('client_id', clientId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    // Get order details with items and calculate charges
    const orderDetails = [];
    let totalCharge = 0;
    let totalUnits = 0;
    let billableOrders = 0;
    let excludedOrders = 0;

    for (const order of orders || []) {
      const orderWeight = parseFloat(order.total_weight || 0);
      
      // Get order items
      const { data: orderItems } = await supabaseAdmin
        .from('order_items')
        .select(`
          *,
          products:product_id (
            name,
            sku
          )
        `)
        .eq('order_id', order.id);

      const orderUnits = (orderItems || []).reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0);

      let orderCharge = 0;
      let billable = false;

      if (orderWeight > 0 && orderWeight <= 5 && orderUnits > 0) {
        orderCharge = BASE_RATE + ((orderUnits - 1) * ADDITIONAL_UNIT_RATE);
        billable = true;
        billableOrders++;
        totalCharge += orderCharge;
        totalUnits += orderUnits;
      } else {
        excludedOrders++;
      }

      orderDetails.push({
        orderNumber: order.order_number,
        status: order.status,
        weight: orderWeight,
        units: orderUnits,
        items: orderItems?.map(item => ({
          product: item.products?.name || 'Unknown',
          sku: item.products?.sku || '',
          quantity: item.quantity
        })) || [],
        billable,
        charge: billable ? Number(orderCharge.toFixed(2)) : 0,
        reason: !billable ? (orderWeight > 5 ? 'Weight > 5 lbs' : orderUnits === 0 ? 'No units' : 'Invalid weight') : null,
        createdAt: order.created_at
      });
    }

    // Get invoices for this client in the month
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    res.status(200).json({
      success: true,
      data: {
        client: {
          id: client.id,
          companyName: client.company_name,
          email: client.email,
          contactPerson: client.contact_person
        },
        period: {
          month: monthNum,
          year: yearNum,
          monthName: new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' })
        },
        summary: {
          totalOrders: orders?.length || 0,
          billableOrders,
          excludedOrders,
          totalUnits,
          totalCharge: Number(totalCharge.toFixed(2)),
          averageChargePerOrder: billableOrders > 0 ? Number((totalCharge / billableOrders).toFixed(2)) : 0
        },
        orders: orderDetails,
        invoices: invoices?.map(inv => ({
          invoiceNumber: inv.invoice_number,
          type: inv.type,
          amount: parseFloat(inv.total_amount || 0),
          status: inv.status,
          dueDate: inv.due_date,
          createdAt: inv.created_at
        })) || [],
        pricingFormula: {
          baseRate: BASE_RATE,
          additionalUnitRate: ADDITIONAL_UNIT_RATE,
          formula: `$${BASE_RATE} + (units - 1) × $${ADDITIONAL_UNIT_RATE}`,
          examples: [
            { units: 1, charge: BASE_RATE },
            { units: 2, charge: BASE_RATE + ADDITIONAL_UNIT_RATE },
            { units: 3, charge: BASE_RATE + (2 * ADDITIONAL_UNIT_RATE) },
            { units: 5, charge: BASE_RATE + (4 * ADDITIONAL_UNIT_RATE) }
          ]
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
