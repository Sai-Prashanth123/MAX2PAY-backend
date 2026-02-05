const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/supabaseAuth');
const {
  generateSecret,
  verifyAndEnable,
  disable,
  verify,
  getStatus
} = require('../controllers/supabaseTwoFactorController');

router.use(protect);

router.get('/status', getStatus);
router.post('/generate', generateSecret);
router.post('/verify-enable', verifyAndEnable);
router.post('/disable', disable);
router.post('/verify', verify);

module.exports = router;
