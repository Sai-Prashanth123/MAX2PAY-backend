const express = require('express');
const {
  getInventoryReport,
  getOrderReport,
  getInboundReport,
  getClientReport,
  getDashboardStats
} = require('../controllers/supabaseReportController');
const {
  getMonthlyInvoiceReport,
  getClientMonthlyReport
} = require('../controllers/supabaseMonthlyReportController');
const { protect, authorize, restrictToOwnClient } = require('../middleware/supabaseAuth');

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboardStats);

router.get('/inventory', restrictToOwnClient, getInventoryReport);

router.get('/orders', restrictToOwnClient, getOrderReport);

router.get('/inbound', restrictToOwnClient, getInboundReport);

router.get('/client/:clientId', authorize('admin'), getClientReport);

// Monthly invoice reports
router.get('/monthly-invoices', authorize('admin'), getMonthlyInvoiceReport);

router.get('/client/:clientId/monthly', authorize('admin'), getClientMonthlyReport);

module.exports = router;
