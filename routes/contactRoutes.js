const express = require('express');
const {
  createContactSubmission,
  getAllContactSubmissions,
  getContactSubmissionById,
  updateContactSubmission,
  deleteContactSubmission
} = require('../controllers/supabaseContactController');
const { protect, authorize } = require('../middleware/supabaseAuth');

const router = express.Router();

// Public route - no authentication required
router.post('/', createContactSubmission);

// Protected routes - admin only
router.use(protect);
router.use(authorize('admin'));

router.get('/', getAllContactSubmissions);
router.get('/:id', getContactSubmissionById);
router.put('/:id', updateContactSubmission);
router.delete('/:id', deleteContactSubmission);

module.exports = router;
