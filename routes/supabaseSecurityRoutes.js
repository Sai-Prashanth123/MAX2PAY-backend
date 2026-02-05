const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/supabaseAuth');
const {
  getAllIPWhitelist,
  addIPWhitelist,
  updateIPWhitelist,
  deleteIPWhitelist,
  getLoginAudit,
  getUserActivity,
  getMyActivity,
  getActivityStats
} = require('../controllers/supabaseSecurityController');

// IP Whitelist Management (Admin only)
router.get('/ip-whitelist', protect, authorize('admin'), getAllIPWhitelist);
router.post('/ip-whitelist', protect, authorize('admin'), addIPWhitelist);
router.put('/ip-whitelist/:id', protect, authorize('admin'), updateIPWhitelist);
router.delete('/ip-whitelist/:id', protect, authorize('admin'), deleteIPWhitelist);

// Login Audit
router.get('/login-audit', protect, getLoginAudit);

// User Activity Timeline
router.get('/activity/me', protect, getMyActivity);
router.get('/activity/:userId', protect, getUserActivity);
router.get('/activity/:userId/stats', protect, getActivityStats);

module.exports = router;
