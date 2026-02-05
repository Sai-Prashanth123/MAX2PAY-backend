const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const supabase = require('./config/supabase');
const { initializeInvoiceCron, stopInvoiceCron } = require('./jobs/invoiceCronScheduler');

dotenv.config();

// MongoDB connection removed - all data now in Supabase

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// CORS configuration - validate production origins
// CLIENT_URL can be comma-separated for multiple origins (e.g. Azure frontend + custom domain)
const parseOrigins = (val) => (val || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = parseOrigins(process.env.CLIENT_URL || 'https://lemon-smoke-0bf242700.2.azurestaticapps.net');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(morgan('dev'));

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 seconds timeout
  res.setTimeout(30000);
  next();
});

// Request ID middleware for logging correlation
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate limiting for auth endpoints
// Increased limits for development, stricter in production
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 10 : 100, // 100 in dev, 10 in prod
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  }
});

// Rate limiting for API endpoints
// Increased limits for development to prevent 429 errors during testing
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 1000, // 1000 in dev, 200 in prod
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  },
  // Use a more lenient key generator for development
  keyGenerator: (req) => {
    // In development, use user ID if available to avoid IP-based blocking
    if (process.env.NODE_ENV !== 'production' && req.user?.id) {
      return req.user.id;
    }
    return req.ip;
  }
});

// Serve static files from uploads directory with proper headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Health check is defined later with Supabase schema checks

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const clientRoutes = require('./routes/clientRoutes');
const clientUserRoutes = require('./routes/clientUserRoutes');
const productRoutes = require('./routes/productRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const inboundRoutes = require('./routes/inboundRoutes');
const orderRoutes = require('./routes/orderRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const enhancedInvoiceRoutes = require('./routes/enhancedInvoiceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const twoFactorRoutes = require('./routes/twoFactorRoutes');
const contactRoutes = require('./routes/contactRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// New security routes
const supabase2FARoutes = require('./routes/supabase2FARoutes');
const supabaseSecurityRoutes = require('./routes/supabaseSecurityRoutes');

// Apply rate limiting to auth endpoints
app.use('/api/auth', authLimiter);
app.use('/api/2fa', authLimiter);

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/client-users', clientUserRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/enhanced-invoices', enhancedInvoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

// Security routes
app.use('/api/2fa-supabase', supabase2FARoutes);
app.use('/api/security', supabaseSecurityRoutes);

// Enhanced health check with connection verification
app.get('/api/health', async (req, res) => {  const healthCheck = {
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: [],
    missingTables: [],
    hint: null
  };

  // Verify Supabase connection first
  try {
    const { error: connectionError } = await supabase.from('user_profiles').select('id', { head: true, count: 'exact' }).limit(1);
    if (connectionError) {
      healthCheck.success = false;
      healthCheck.status = 'database_connection_error';
      healthCheck.checks.push({ 
        check: 'database_connection', 
        ok: false, 
        error: connectionError.message 
      });
      return res.status(503).json(healthCheck);
    }
  } catch (err) {
    healthCheck.success = false;
    healthCheck.status = 'database_connection_error';
    healthCheck.checks.push({ 
      check: 'database_connection', 
      ok: false, 
      error: err.message 
    });
    return res.status(503).json(healthCheck);
  }

  // Check required tables
  const checks = [
    { table: 'user_profiles', query: supabase.from('user_profiles').select('id', { head: true, count: 'exact' }).limit(1) },
    { table: 'clients', query: supabase.from('clients').select('id', { head: true, count: 'exact' }).limit(1) },
    { table: 'products', query: supabase.from('products').select('id', { head: true, count: 'exact' }).limit(1) },
    { table: 'inventory', query: supabase.from('inventory').select('id', { head: true, count: 'exact' }).limit(1) },
  ];

  const results = [];
  for (const c of checks) {
    // eslint-disable-next-line no-await-in-loop
    const { error } = await c.query;
    results.push({ table: c.table, ok: !error, error: error?.message || null });
  }

  const missing = results.filter(r => !r.ok).map(r => r.table);
  healthCheck.checks = results;
  healthCheck.missingTables = missing;
  healthCheck.success = missing.length === 0;
  healthCheck.status = missing.length === 0 ? 'ok' : 'supabase_schema_missing';
  healthCheck.hint = missing.length
    ? 'Run `supabase-schema.sql` in Supabase SQL Editor, then restart backend and refresh.'
    : null;

  res.status(missing.length ? 503 : 200).json(healthCheck);
});

app.use(errorHandler);

// Default to 5001 to match ENV_SETUP.md, but allow override via env
const PORT = parseInt(process.env.PORT, 10) || 5001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  
  // Initialize automated invoice cron scheduler
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_INVOICE_CRON === 'true') {
    initializeInvoiceCron();
  } else {
    console.log('ℹ️  Invoice cron scheduler disabled (set ENABLE_INVOICE_CRON=true to enable in development)');
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  stopInvoiceCron();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  stopInvoiceCron();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
