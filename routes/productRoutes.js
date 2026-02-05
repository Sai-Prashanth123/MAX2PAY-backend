const express = require('express');
const { body } = require('express-validator');
const {
  getAllProducts,
  getProductById,
  getProductsByClient,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/supabaseProductController');
const { protect, authorize, restrictToOwnClient } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', restrictToOwnClient, getAllProducts);

router.get('/client/:clientId', getProductsByClient);

router.get('/:id', getProductById);

router.post(
  '/',
  authorize('admin', 'employee'),
  upload.single('image'),
  [
    body('name').notEmpty().withMessage('Product name is required'),
    body('sku').notEmpty().withMessage('SKU is required'),
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('unit').optional().isIn(['pcs', 'kg', 'ltr', 'box', 'carton', 'pallet']).withMessage('Invalid unit'),
    body('reorderLevel').optional().isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
    validate
  ],
  createProduct
);

router.put(
  '/:id',
  authorize('admin', 'employee'),
  upload.single('image'),
  [
    body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
    body('sku').optional().notEmpty().withMessage('SKU cannot be empty'),
    body('unit').optional().isIn(['pcs', 'kg', 'ltr', 'box', 'carton', 'pallet']).withMessage('Invalid unit'),
    body('reorderLevel').optional().isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
    validate
  ],
  updateProduct
);

router.delete('/:id', authorize('admin'), deleteProduct);

module.exports = router;
