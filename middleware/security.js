/**
 * Security Middleware - Simplified for 3PL MVP
 * 
 * 5 Clear Layers:
 * 1. Rate Limiting (prevent brute force)
 * 2. Security Headers (helmet)
 * 3. Input Validation (prevent injection)
 * 4. Authorization (client data isolation)
 * 5. Audit Logging (financial + auth events only)
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, param, validationResult } = require('express-validator');
const supabaseAdmin = require('../config/supabaseAdmin');

// ============================================
// 1. RATE LIMITING
// ============================================

// Auth endpoints: 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// API endpoints: 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health'
});

// Financial endpoints: 10 requests per minute
const financialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many financial operations. Wait 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// 2. SECURITY HEADERS
// ============================================

const securityHeaders = helmet({
  contentSecurityPolicy: false, // Let frontend handle CSP
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
});

// ============================================
// 3. INPUT VALIDATION (Simple & Essential)
// ============================================

// UUID validation
const validateUUID = (field) => param(field).isUUID().withMessage('Invalid ID');

// Amount validation (for invoices/payments)
const validateAmount = (field) => body(field).isFloat({ min: 0 }).toFloat();

// Order status validation
const validateOrderStatus = body('status')
  .isIn(['pending', 'approved', 'packed', 'dispatched'])
  .withMessage('Invalid status');

// Validation error handler
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg // Return first error only
    });
  }
  next();
};


// ============================================
// 5. AUDIT LOGGING (Financial + Auth Only)
// ============================================

const auditLog = (action) => {
  return async (req, res, next) => {
    // Capture response status
    const originalJson = res.json;
    res.json = function(data) {
      // Log only if successful and in production
      if (res.statusCode < 400 && process.env.NODE_ENV === 'production') {
        supabaseAdmin.from('audit_logs').insert({
          action,
          user_id: req.user?.id,
          client_id: req.user?.client_id,
          ip_address: req.ip,
          status_code: res.statusCode
        }).then(); // Fire and forget
      }
      return originalJson.call(this, data);
    };
    next();
  };
};

// ============================================
// 4. AUTHORIZATION (Client Data Isolation)
// ============================================

const restrictToOwnClient = (req, res, next) => {
  // Admins can access all data
  if (req.user?.role === 'admin') return next();

  // Clients must have client_id
  if (!req.user?.client_id) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  // Get requested client ID from any source
  const requestedId = req.params.clientId || req.body.clientId || req.query.clientId;

  // If client ID specified, verify it matches user's client_id
  if (requestedId && requestedId !== req.user.client_id) {
    console.warn(`[SECURITY] Client ${req.user.id} tried to access ${requestedId}`);
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  next();
};


// Error sanitizer (last middleware)
const sanitizeErrors = (err, req, res, next) => {
  console.error('[ERROR]', err.message);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message
  });
};

module.exports = {
  // Layer 1: Rate Limiting
  authLimiter,
  apiLimiter,
  financialLimiter,
  
  // Layer 2: Security Headers
  securityHeaders,
  
  // Layer 3: Input Validation
  validateUUID,
  validateAmount,
  validateOrderStatus,
  validate,
  
  // Layer 4: Authorization
  restrictToOwnClient,
  
  // Layer 5: Audit Logging
  auditLog,
  
  // Error Handler
  sanitizeErrors
};
