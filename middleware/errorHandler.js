const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error with request context
  const requestId = req.id || req.headers['x-request-id'] || 'unknown';
  console.error(`[${requestId}] Error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  // Handle Supabase errors
  if (err.code) {
    // Supabase error codes
    if (err.code === 'PGRST116') {
      const message = 'Resource not found';
      error = { message, statusCode: 404, code: 'NOT_FOUND' };
    } else if (err.code === '23505') {
      const field = err.detail?.match(/\(([^)]+)\)/)?.[1] || 'field';
      const message = `Duplicate field value: ${field}. Please use another value`;
      error = { message, statusCode: 400, code: 'DUPLICATE_VALUE' };
    } else if (err.code === '23503') {
      const message = 'Referenced resource does not exist';
      error = { message, statusCode: 400, code: 'FOREIGN_KEY_VIOLATION' };
    } else if (err.code === '23502') {
      const message = 'Required field is missing';
      error = { message, statusCode: 400, code: 'NOT_NULL_VIOLATION' };
    }
  }

  // Handle MongoDB-style errors (legacy compatibility)
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404, code: 'NOT_FOUND' };
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    const message = `Duplicate field value: ${field}. Please use another value`;
    error = { message, statusCode: 400, code: 'DUPLICATE_VALUE' };
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors || {}).map(val => val.message).join(', ');
    error = { message, statusCode: 400, code: 'VALIDATION_ERROR' };
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401, code: 'INVALID_TOKEN' };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401, code: 'TOKEN_EXPIRED' };
  }

  // Standardized error response format
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    code: error.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.details || null
    })
  });
};

module.exports = errorHandler;
