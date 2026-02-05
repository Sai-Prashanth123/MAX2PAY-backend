const express = require('express');
const { body } = require('express-validator');
const {
  getAllPricing,
  getPricingById,
  getClientPricing,
  createPricing,
  updatePricing,
  deletePricing
} = require('../controllers/supabasePricingController');
const { protect, authorize } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin'), getAllPricing);

router.get('/client/:clientId', authorize('admin'), getClientPricing);

router.get('/:id', authorize('admin'), getPricingById);

router.post(
  '/',
  authorize('admin'),
  [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('ratePerOrder').isFloat({ min: 0 }).withMessage('Rate per order must be a positive number'),
    validate
  ],
  createPricing
);

router.put('/:id', authorize('admin'), updatePricing);

router.delete('/:id', authorize('admin'), deletePricing);

module.exports = router;
