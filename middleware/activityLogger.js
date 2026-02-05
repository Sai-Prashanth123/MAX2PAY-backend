const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Activity Logger Middleware
 * Logs user activities to user_activity table
 */
const logActivity = async (userId, activityType, entityType, entityId, description, metadata, req) => {
  try {
    const clientIP = req?.ip || 
                     req?.headers?.['x-forwarded-for']?.split(',')[0] || 
                     req?.connection?.remoteAddress ||
                     'unknown';
    
    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    const activityData = {
      user_id: userId,
      activity_type: activityType,
      entity_type: entityType,
      entity_id: entityId,
      description: description,
      metadata: metadata || {},
      ip_address: clientIP.replace(/^::ffff:/, ''),
      user_agent: userAgent
    };

    await supabaseAdmin
      .from('user_activity')
      .insert(activityData);

  } catch (error) {
    console.error('Activity logging error:', error);
    // Don't throw error - logging failure shouldn't break the request
  }
};

/**
 * Express middleware to automatically log activities
 */
const activityLoggerMiddleware = (activityType, entityType) => {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send function to log after successful response
    res.send = function(data) {
      // Only log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user?.id;
        const entityId = req.params?.id || req.body?.id;
        
        let description = `${activityType} ${entityType}`;
        if (req.method === 'POST') description = `Created ${entityType}`;
        if (req.method === 'PUT' || req.method === 'PATCH') description = `Updated ${entityType}`;
        if (req.method === 'DELETE') description = `Deleted ${entityType}`;
        if (req.method === 'GET') description = `Viewed ${entityType}`;

        const metadata = {
          method: req.method,
          path: req.path,
          params: req.params,
          query: req.query
        };

        if (userId) {
          logActivity(userId, activityType, entityType, entityId, description, metadata, req)
            .catch(err => console.error('Activity log error:', err));
        }
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
};

module.exports = {
  logActivity,
  activityLoggerMiddleware
};
