const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/supabaseAuth');
const {
  setup2FA,
  verify2FA,
  validate2FAToken,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes
} = require('../controllers/supabase2FAController');

// Setup 2FA (generate QR code and secret)
router.post('/setup', protect, setup2FA);

// Verify 2FA setup (enable 2FA)
router.post('/verify', protect, verify2FA);

// Validate 2FA token during login (public - no auth required)
router.post('/validate', validate2FAToken);

// Disable 2FA
router.post('/disable', protect, disable2FA);

// Get 2FA status
router.get('/status', protect, get2FAStatus);

// Regenerate backup codes
router.post('/regenerate-backup-codes', protect, regenerateBackupCodes);

module.exports = router;
