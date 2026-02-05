const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/supabaseAuth');
const {
  requestDemoAccess,
  verifyDemoAccess,
  getDemoAccessStatus,
  getDemoAccessLogs,
  revokeDemoAccess,
  getAllDemoAccess,
  cleanupExpired,
  resetDemoCredentials
} = require('../controllers/supabaseDemoAccessController');

/**
 * Demo Access Routes
 * Handles demo account access requests and management
 */

// Public routes
router.post('/request', requestDemoAccess);
router.post('/verify/:token', verifyDemoAccess);
router.get('/status/:email', getDemoAccessStatus);

// Admin only routes
router.get('/logs/:email', protect, authorize('admin'), getDemoAccessLogs);
router.delete('/revoke/:email', protect, authorize('admin'), revokeDemoAccess);
router.get('/all', protect, authorize('admin'), getAllDemoAccess);
router.post('/cleanup', protect, authorize('admin'), cleanupExpired);
router.post('/reset-credentials', protect, authorize('admin'), resetDemoCredentials);

module.exports = router;
