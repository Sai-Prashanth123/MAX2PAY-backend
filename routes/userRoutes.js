const express = require('express');
const { body } = require('express-validator');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/supabaseUserController');
const { protect, authorize } = require('../middleware/supabaseAuth');
const { validate } = require('../middleware/validator');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/', getAllUsers);

router.get('/:id', getUserById);

router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['admin', 'client', 'employee']).withMessage('Invalid role'),
    validate
  ],
  createUser
);

router.put('/:id', updateUser);

router.delete('/:id', deleteUser);

module.exports = router;
