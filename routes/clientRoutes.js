const express = require('express');
const {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats
} = require('../controllers/supabaseClientController');
const { protect, authorize } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');
const { body } = require('express-validator');

const router = express.Router();

router.use(protect);

router.get('/', getAllClients);

router.get('/:id', getClientById);

router.get('/:id/stats', getClientStats);

router.post(
  '/',
  authorize('admin'),
  [
    body('companyName').notEmpty().withMessage('Company name is required'),
    body('contactPerson').notEmpty().withMessage('Contact person is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('phone').notEmpty().withMessage('Phone is required'),
    validate
  ],
  createClient
);

router.put(
  '/:id',
  authorize('admin'),
  [
    body('companyName').optional().notEmpty().withMessage('Company name cannot be empty'),
    body('contactPerson').optional().notEmpty().withMessage('Contact person cannot be empty'),
    body('email').optional().isEmail().withMessage('Please provide a valid email'),
    body('phone').optional().notEmpty().withMessage('Phone cannot be empty'),
    validate
  ],
  updateClient
);

router.delete('/:id', authorize('admin'), deleteClient);

module.exports = router;
