const express = require('express');
const { body } = require('express-validator');
const {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  updateOrderAttachment,
  getOrderStats
} = require('../controllers/supabaseOrderController');
const { protect, authorize, restrictToOwnClient } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', restrictToOwnClient, getAllOrders);

router.get('/stats', restrictToOwnClient, getOrderStats);

router.get('/:id', getOrderById);

router.post(
  '/',
  (req, res, next) => {    next();
  },
  upload.single('attachment'),
  (req, res, next) => {    next();
  },
  createOrder
);

router.put(
  '/:id/status',
  authorize('admin', 'employee'),
  [
    body('status').isIn(['pending', 'approved', 'packed', 'dispatched', 'cancelled'])
      .withMessage('Invalid status'),
    validate
  ],
  updateOrderStatus
);

router.put(
  '/:id/attachment',
  upload.single('attachment'),
  updateOrderAttachment
);

module.exports = router;
