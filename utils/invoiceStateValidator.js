/**
 * Invoice State Validator
 * Ensures invoice states are always mathematically correct
 * and prevents accounting inconsistencies
 */

/**
 * Compute correct balance_due from total and paid amounts
 * @param {number} totalAmount - Total invoice amount
 * @param {number} paidAmount - Amount paid so far
 * @returns {number} Correct balance due
 */
exports.computeBalanceDue = (totalAmount, paidAmount) => {
  const total = parseFloat(totalAmount || 0);
  const paid = parseFloat(paidAmount || 0);
  const balance = total - paid;
  
  // Never allow negative balance
  return Math.max(0, balance);
};

/**
 * Derive correct status from payment amounts
 * Status MUST be computed, never manually set
 * @param {number} totalAmount - Total invoice amount
 * @param {number} paidAmount - Amount paid so far
 * @returns {string} Correct status
 */
exports.deriveStatus = (totalAmount, paidAmount) => {
  const total = parseFloat(totalAmount || 0);
  const paid = parseFloat(paidAmount || 0);
  
  if (paid === 0) {
    return 'sent';
  } else if (paid < total) {
    return 'partial';
  } else if (paid >= total) {
    return 'paid';
  }
  
  return 'sent'; // Default fallback
};

/**
 * Validate invoice state for accounting consistency
 * Throws error if state is invalid
 * @param {object} invoice - Invoice object to validate
 * @throws {Error} If invoice state is invalid
 */
exports.validateInvoiceState = (invoice) => {
  const total = parseFloat(invoice.total_amount || 0);
  const paid = parseFloat(invoice.paid_amount || 0);
  const balance = parseFloat(invoice.balance_due || 0);
  const status = invoice.status;

  // HARD GUARDRAIL 1: paid_amount cannot exceed total_amount
  if (paid > total) {
    throw new Error(
      `Invalid invoice state: paid_amount ($${paid.toFixed(2)}) exceeds total_amount ($${total.toFixed(2)})`
    );
  }

  // HARD GUARDRAIL 2: balance_due cannot be negative
  if (balance < 0) {
    throw new Error(
      `Invalid invoice state: balance_due cannot be negative ($${balance.toFixed(2)})`
    );
  }

  // HARD GUARDRAIL 3: status='paid' requires balance_due=0
  if (status === 'paid' && balance > 0) {
    throw new Error(
      `Invalid invoice state: status is 'paid' but balance_due is $${balance.toFixed(2)}`
    );
  }

  // HARD GUARDRAIL 4: status='sent' requires paid_amount=0
  if (status === 'sent' && paid > 0) {
    throw new Error(
      `Invalid invoice state: status is 'sent' but paid_amount is $${paid.toFixed(2)}`
    );
  }

  // HARD GUARDRAIL 5: balance_due must equal total - paid
  const correctBalance = total - paid;
  const tolerance = 0.01; // Allow 1 cent tolerance for floating point
  if (Math.abs(balance - correctBalance) > tolerance) {
    throw new Error(
      `Invalid invoice state: balance_due ($${balance.toFixed(2)}) does not match total - paid ($${correctBalance.toFixed(2)})`
    );
  }

  return true;
};

/**
 * Normalize invoice state to ensure consistency
 * Recomputes all derived fields from source of truth
 * @param {object} invoice - Invoice object to normalize
 * @returns {object} Normalized invoice with correct computed fields
 */
exports.normalizeInvoiceState = (invoice) => {
  const total = parseFloat(invoice.total_amount || 0);
  const paid = parseFloat(invoice.paid_amount || 0);
  
  // ALWAYS compute these - never trust stored values
  const balance_due = exports.computeBalanceDue(total, paid);
  const status = exports.deriveStatus(total, paid);
  
  return {
    ...invoice,
    balance_due,
    status,
    // Set paid_date if fully paid and not already set
    paid_date: status === 'paid' && !invoice.paid_date 
      ? new Date().toISOString().split('T')[0] 
      : invoice.paid_date
  };
};

/**
 * Prepare invoice update data with correct computed fields
 * Use this before any invoice update operation
 * @param {object} updateData - Data to update
 * @param {object} currentInvoice - Current invoice state
 * @returns {object} Update data with correct computed fields
 */
exports.prepareInvoiceUpdate = (updateData, currentInvoice) => {
  // Start with current values
  const total = parseFloat(updateData.total_amount ?? (currentInvoice.total_amount || 0));
  const paid = parseFloat(updateData.paid_amount ?? (currentInvoice.paid_amount || 0));
  
  // Validate payment doesn't exceed total
  if (paid > total) {
    throw new Error(
      `Payment amount ($${paid.toFixed(2)}) exceeds invoice total ($${total.toFixed(2)})`
    );
  }
  
  // ALWAYS recompute derived fields
  const balance_due = exports.computeBalanceDue(total, paid);
  const status = exports.deriveStatus(total, paid);
  
  return {
    ...updateData,
    balance_due,
    status,
    paid_date: status === 'paid' && !currentInvoice.paid_date
      ? new Date().toISOString().split('T')[0]
      : currentInvoice.paid_date,
    updated_at: new Date().toISOString()
  };
};

/**
 * Format invoice for API response with guaranteed correct values
 * @param {object} invoice - Raw invoice from database
 * @returns {object} Formatted invoice with recomputed fields
 */
exports.formatInvoiceResponse = (invoice) => {
  // CRITICAL: Always recompute before sending to frontend
  const normalized = exports.normalizeInvoiceState(invoice);
  
  return {
    ...invoice,
    balance_due: normalized.balance_due,
    status: normalized.status,
    paid_date: normalized.paid_date
  };
};
