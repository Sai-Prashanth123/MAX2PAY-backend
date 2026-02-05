/**
 * Backend Invoice Calculation Service
 * Server-side calculation engine for invoice generation
 * Ensures data integrity and financial accuracy
 */

/**
 * Calculate line item amount
 */
const calculateLineItemAmount = (chargeQty, rate) => {
  const qty = parseFloat(chargeQty) || 0;
  const rateValue = parseFloat(rate) || 0;
  return Number((qty * rateValue).toFixed(2));
};

/**
 * Calculate subtotal from line items
 */
const calculateSubtotal = (lineItems) => {
  if (!Array.isArray(lineItems)) return 0;
  
  const subtotal = lineItems.reduce((sum, item) => {
    const amount = parseFloat(item.amount) || 0;
    return sum + amount;
  }, 0);
  
  return Number(subtotal.toFixed(2));
};

/**
 * Calculate tax
 */
const calculateTax = (subtotal, taxPercentage = 0) => {
  const sub = parseFloat(subtotal) || 0;
  const taxRate = parseFloat(taxPercentage) || 0;
  const tax = sub * (taxRate / 100);
  
  return Number(tax.toFixed(2));
};

/**
 * Calculate total
 */
const calculateTotal = (subtotal, tax) => {
  const sub = parseFloat(subtotal) || 0;
  const taxAmount = parseFloat(tax) || 0;
  
  return Number((sub + taxAmount).toFixed(2));
};

/**
 * Calculate balance
 */
const calculateBalance = (total, advancePaid) => {
  const totalAmount = parseFloat(total) || 0;
  const advance = parseFloat(advancePaid) || 0;
  const balance = totalAmount - advance;
  
  return Number(Math.max(0, balance).toFixed(2));
};

/**
 * Complete invoice calculation
 * Auto-calculates all values and returns invoice object ready for database
 */
const calculateInvoice = (data) => {
  const {
    lineItems = [],
    taxPercentage = 0,
    advancePaid = 0
  } = data;

  // Calculate each line item amount
  const calculatedLineItems = lineItems.map(item => ({
    ...item,
    amount: calculateLineItemAmount(item.chargeQty || item.quantity, item.rate)
  }));

  // Calculate subtotal
  const subtotal = calculateSubtotal(calculatedLineItems);

  // Calculate tax
  const tax = calculateTax(subtotal, taxPercentage);

  // Calculate total
  const total = calculateTotal(subtotal, tax);

  // Calculate balance
  const balance = calculateBalance(total, advancePaid);

  return {
    lineItems: calculatedLineItems,
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
    balance: Number(balance.toFixed(2)),
    advancePaid: Number((parseFloat(advancePaid) || 0).toFixed(2))
  };
};

/**
 * Calculate fulfillment invoice
 * Formula: $2.50 + (number_of_units - 1) × $1.25 per order
 * Note: This is a simplified calculation. Actual implementation in controller
 * fetches order_items to calculate units per order.
 */
const calculateFulfillmentInvoice = (data) => {
  const {
    totalOrders = 0,
    totalUnits = 0,
    advancePaid = 0
  } = data;

  // Pricing formula: $2.50 + (number_of_units - 1) × $1.25 per order
  const BASE_RATE = 2.50;
  const ADDITIONAL_UNIT_RATE = 1.25;

  const lineItems = [];

  if (totalOrders > 0 && totalUnits > 0) {
    // For calculation service, we need average units per order
    const avgUnitsPerOrder = totalUnits / totalOrders;
    const chargePerOrder = BASE_RATE + ((avgUnitsPerOrder - 1) * ADDITIONAL_UNIT_RATE);
    const totalAmount = Number((totalOrders * chargePerOrder).toFixed(2));
    
    lineItems.push({
      description: `Order Fulfillment (${totalOrders} orders, ${totalUnits} total units)`,
      chargeQty: totalOrders,
      rate: Number(chargePerOrder.toFixed(2)),
      amount: totalAmount
    });
  }

  // No tax, no other fees
  return calculateInvoice({
    lineItems,
    taxPercentage: 0,
    advancePaid
  });
};

/**
 * Calculate monthly invoice
 * Formula: $2.50 + (number_of_units - 1) × $1.25 per order
 * Note: This is a simplified calculation. Actual implementation in controller
 * fetches order_items to calculate units per order.
 */
const calculateMonthlyInvoice = (data) => {
  const {
    totalOrders = 0,
    totalUnits = 0,
    advancePaid = 0
  } = data;

  // Pricing formula: $2.50 + (number_of_units - 1) × $1.25 per order
  const BASE_RATE = 2.50;
  const ADDITIONAL_UNIT_RATE = 1.25;

  const lineItems = [];

  if (totalOrders > 0 && totalUnits > 0) {
    // For calculation service, we need average units per order
    const avgUnitsPerOrder = totalUnits / totalOrders;
    const chargePerOrder = BASE_RATE + ((avgUnitsPerOrder - 1) * ADDITIONAL_UNIT_RATE);
    const totalAmount = Number((totalOrders * chargePerOrder).toFixed(2));
    
    lineItems.push({
      description: `Order Fulfillment (${totalOrders} orders, ${totalUnits} total units)`,
      chargeQty: totalOrders,
      rate: Number(chargePerOrder.toFixed(2)),
      amount: totalAmount
    });
  }

  // No tax, no other fees
  return calculateInvoice({
    lineItems,
    taxPercentage: 0,
    advancePaid
  });
};

/**
 * Validate invoice data
 */
const validateInvoiceData = (data) => {
  const errors = [];

  if (!data.lineItems || data.lineItems.length === 0) {
    errors.push('At least one line item is required');
  }

  data.lineItems?.forEach((item, index) => {
    if (!item.chargeQty && !item.quantity) {
      errors.push(`Line item ${index + 1}: Quantity is required`);
    }
    if (!item.rate) {
      errors.push(`Line item ${index + 1}: Rate is required`);
    }
    if (parseFloat(item.chargeQty || item.quantity) < 0) {
      errors.push(`Line item ${index + 1}: Quantity cannot be negative`);
    }
    if (parseFloat(item.rate) < 0) {
      errors.push(`Line item ${index + 1}: Rate cannot be negative`);
    }
  });

  if (data.taxPercentage && (parseFloat(data.taxPercentage) < 0 || parseFloat(data.taxPercentage) > 100)) {
    errors.push('Tax percentage must be between 0 and 100');
  }

  if (data.advancePaid && parseFloat(data.advancePaid) < 0) {
    errors.push('Advance paid cannot be negative');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  calculateLineItemAmount,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  calculateBalance,
  calculateInvoice,
  calculateFulfillmentInvoice,
  calculateMonthlyInvoice,
  validateInvoiceData
};
