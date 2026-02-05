const express = require('express');
const { body } = require('express-validator');
const {
  getAllInventory,
  getInventoryByProduct,
  adjustInventory,
  getInventoryStats,
  deleteInventory
} = require('../controllers/supabaseInventoryController');
const { protect, authorize, restrictToOwnClient } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');

const router = express.Router();

router.use(protect);

router.get('/', restrictToOwnClient, getAllInventory);

router.get('/stats', restrictToOwnClient, getInventoryStats);

router.get('/product/:productId', getInventoryByProduct);

router.post(
  '/adjust',
  authorize('admin', 'employee'),
  [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('adjustment').isNumeric().withMessage('Adjustment must be a number'),
    body('reason').notEmpty().withMessage('Reason is required'),
    validate
  ],
  adjustInventory
);

router.delete('/:id', authorize('admin'), deleteInventory);

module.exports = router;
