const express = require('express');
const { body } = require('express-validator');
const {
  getAllPayments,
  getPaymentById,
  getInvoicePayments,
  recordPayment,
  updatePayment,
  deletePayment
} = require('../controllers/supabasePaymentController');
const { protect, authorize } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin'), getAllPayments);

router.get('/invoice/:invoiceId', authorize('admin'), getInvoicePayments);

router.get('/:id', authorize('admin'), getPaymentById);

router.post(
  '/',
  authorize('admin'),
  [
    body('invoiceId').notEmpty().withMessage('Invoice ID is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    validate
  ],
  recordPayment
);

router.put('/:id', authorize('admin'), updatePayment);

router.delete('/:id', authorize('admin'), deletePayment);

module.exports = router;
