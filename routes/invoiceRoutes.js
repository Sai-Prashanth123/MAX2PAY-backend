const express = require('express');
const { body } = require('express-validator');
const {
  getAllInvoices,
  getInvoiceById,
  createInvoice,
  uploadInvoiceFile,
  updateInvoice,
  deleteInvoice,
  generateMonthlyInvoice,
  rebuildMonthlyInvoice,
  generateBulkMonthlyInvoices,
  generateFulfillmentInvoice
} = require('../controllers/supabaseInvoiceController');
const {
  generateMonthlyInvoicesAuto,
  testAutoGeneration
} = require('../controllers/autoInvoiceController');
const {
  recordPayment,
  getInvoicePayments,
  deletePayment
} = require('../controllers/invoicePaymentController');
const { protect, authorize, restrictToOwnClient } = require('../middleware/supabaseAuth');
const upload = require('../middleware/upload');
const { validate } = require('../middleware/validator');

const router = express.Router();

// ============================================
// AUTOMATED INVOICE GENERATION ROUTES
// These routes are NOT protected by user auth
// They use internal service key authentication
// ============================================

/**
 * Automated monthly invoice generation (triggered by cron)
 * Security: Internal service key required in header
 * Header: x-service-key: <INTERNAL_SERVICE_KEY>
 */
router.post('/generate-monthly-auto', generateMonthlyInvoicesAuto);

/**
 * Test endpoint for automated generation (admin only for testing)
 * Allows manual testing of auto-generation logic
 */
router.post('/test-auto-generation', protect, authorize('admin'), testAutoGeneration);

// ============================================
// PROTECTED USER ROUTES (require authentication)
// ============================================

router.use(protect);

router.get('/', restrictToOwnClient, getAllInvoices);

router.get('/:id', getInvoiceById);

router.post(
  '/',
  [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('type').isIn(['inbound', 'outbound', 'storage', 'other', 'monthly']).withMessage('Invalid invoice type'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('totalAmount').isNumeric().withMessage('Total amount must be a number'),
    validate
  ],
  createInvoice
);

router.post(
  '/generate/monthly',
  authorize('admin'),
  [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2020 }).withMessage('Invalid year'),
    validate
  ],
  generateMonthlyInvoice
);

router.post(
  '/rebuild-monthly',
  authorize('admin'),
  [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2020 }).withMessage('Invalid year'),
    validate
  ],
  rebuildMonthlyInvoice
);

router.post(
  '/generate/bulk',
  authorize('admin'),
  [
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2020 }).withMessage('Invalid year'),
    validate
  ],
  generateBulkMonthlyInvoices
);

router.post(
  '/generate/fulfillment',
  authorize('admin'),
  [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    validate
  ],
  generateFulfillmentInvoice
);

router.post('/:id/upload', upload.single('file'), uploadInvoiceFile);

router.put('/:id', updateInvoice);

router.delete('/:id', authorize('admin'), deleteInvoice);

// ============================================
// PAYMENT ROUTES (Partial Payment Support)
// ============================================

// Record a payment against an invoice
router.post(
  '/:id/payments',
  authorize('admin'),
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
    body('paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
    body('paymentMethod').optional().isString(),
    body('referenceNumber').optional().isString(),
    body('notes').optional().isString(),
    validate
  ],
  recordPayment
);

// Get all payments for an invoice
router.get('/:id/payments', getInvoicePayments);

// Delete a payment (for corrections)
router.delete('/:invoiceId/payments/:paymentId', authorize('admin'), deletePayment);

module.exports = router;
