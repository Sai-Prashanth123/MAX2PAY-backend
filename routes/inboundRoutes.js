const express = require('express');
const { body } = require('express-validator');
const {
  getAllInboundLogs,
  createInboundLog,
  updateInboundLog,
  getInboundStats,
  deleteInboundLog
} = require('../controllers/supabaseInboundController');
const { protect, authorize, restrictToOwnClient } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');

const router = express.Router();

router.use(protect);

router.get('/', restrictToOwnClient, getAllInboundLogs);

router.get('/stats', restrictToOwnClient, getInboundStats);

router.post(
  '/',
  authorize('admin', 'employee'),
  [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('referenceNumber').notEmpty().withMessage('Reference number is required'),
    body('storageLocation').notEmpty().withMessage('Storage location is required'),
    validate
  ],
  createInboundLog
);

router.put('/:id', authorize('admin', 'employee'), updateInboundLog);

router.delete('/:id', authorize('admin', 'employee'), deleteInboundLog);

module.exports = router;
