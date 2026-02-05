/**
 * Financial Security - Server-Side Only
 * 
 * CRITICAL: All financial calculations MUST happen server-side
 * Never trust amounts from frontend
 */

const supabaseAdmin = require('../config/supabaseAdmin');

// ============================================
// INVOICE AMOUNT CALCULATION (Server-Side Only)
// ============================================

/**
 * Calculate invoice amount from orders
 * Formula: $2.50 + (units - 1) × $1.25 per order
 */
function calculateInvoiceAmount(orders) {
  let total = 0;
  
  for (const order of orders) {
    const units = order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    const orderAmount = 2.50 + Math.max(0, units - 1) * 1.25;
    total += orderAmount;
  }
  
  return parseFloat(total.toFixed(2));
}

/**
 * Verify invoice integrity before saving
 * Throws error if amounts don't match
 */
function verifyInvoiceIntegrity(invoiceData, orders) {
  const calculatedTotal = calculateInvoiceAmount(orders);
  const providedTotal = parseFloat(invoiceData.total_amount);
  
  // Allow 1 cent difference for rounding
  if (Math.abs(calculatedTotal - providedTotal) > 0.01) {
    throw new Error(
      `Invoice amount mismatch. Expected: ${calculatedTotal}, Got: ${providedTotal}`
    );
  }
  
  return true;
}

// ============================================
// ORDER LOCKING (Prevent Modification After Invoice)
// ============================================

/**
 * Check if order is locked by invoice
 */
async function isOrderLocked(orderId) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('invoice_id, invoices:invoice_id(status)')
    .eq('id', orderId)
    .single();
  
  if (!order?.invoice_id) return false;
  
  const invoiceStatus = order.invoices?.status;
  return ['sent', 'partial', 'paid'].includes(invoiceStatus);
}

/**
 * Verify order can be modified
 * Throws error if locked
 */
async function verifyOrderEditable(orderId) {
  const locked = await isOrderLocked(orderId);
  
  if (locked) {
    throw new Error('Order is locked by invoice and cannot be modified');
  }
  
  return true;
}

/**
 * Verify order status transition is valid
 * Enforces state machine: pending → approved → packed → dispatched
 */
function validateStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'pending': ['approved'],
    'approved': ['packed'],
    'packed': ['dispatched'],
    'dispatched': [] // Final state
  };
  
  const allowed = validTransitions[currentStatus] || [];
  
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${currentStatus} → ${newStatus}`
    );
  }
  
  return true;
}

// ============================================
// PAYMENT VALIDATION
// ============================================

/**
 * Validate payment amount doesn't exceed invoice balance
 */
async function validatePaymentAmount(invoiceId, paymentAmount) {
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('total_amount, amount_paid')
    .eq('id', invoiceId)
    .single();
  
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  
  const balance = invoice.total_amount - (invoice.amount_paid || 0);
  
  if (paymentAmount > balance + 0.01) { // Allow 1 cent rounding
    throw new Error(
      `Payment amount (${paymentAmount}) exceeds balance (${balance})`
    );
  }
  
  return true;
}

module.exports = {
  // Invoice calculations
  calculateInvoiceAmount,
  verifyInvoiceIntegrity,
  
  // Order locking
  isOrderLocked,
  verifyOrderEditable,
  validateStatusTransition,
  
  // Payment validation
  validatePaymentAmount
};
