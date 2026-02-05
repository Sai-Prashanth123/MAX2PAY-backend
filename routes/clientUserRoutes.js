const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');
const {
  createClientUser,
  getClientUsers,
  updateClientUser,
  deleteClientUser,
  resetClientPassword
} = require('../controllers/supabaseClientUserController');

router.post(
  '/',
  protect,
  authorize('admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('clientId').notEmpty().withMessage('Client ID is required'),
    validate
  ],
  createClientUser
);

router.get(
  '/',
  protect,
  authorize('admin'),
  getClientUsers
);

router.put(
  '/:id',
  protect,
  authorize('admin'),
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().notEmpty().withMessage('Phone cannot be empty'),
    validate
  ],
  updateClientUser
);

router.delete(
  '/:id',
  protect,
  authorize('admin'),
  deleteClientUser
);

router.put(
  '/:id/reset-password',
  protect,
  authorize('admin'),
  [
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
  ],
  resetClientPassword
);

module.exports = router;
