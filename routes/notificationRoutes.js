const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/supabaseAuth');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats
} = require('../controllers/supabaseNotificationController');

// Apply authentication middleware to all routes
router.use(protect);

router.get('/', getNotifications);
router.get('/stats', getNotificationStats);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;
