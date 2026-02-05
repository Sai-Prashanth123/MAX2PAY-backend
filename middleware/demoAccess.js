const supabase = require('../config/supabase');

/**
 * IP Whitelisting Middleware for Demo Accounts
 * Checks if the requesting IP is authorized for demo access
 */

// Demo account emails (for identification)
const DEMO_ACCOUNTS = {
  admin: 'admin@demo3pl.com',
  client: 'client@demo3pl.com'
};

// Allowed IP ranges (CIDR notation) - configure based on your needs
const ALLOWED_IP_RANGES = [
  '127.0.0.1', // localhost
  '::1', // localhost IPv6
  // Add your office/allowed IPs here
  // '192.168.1.0/24', // Example: local network
];

/**
 * Check if IP is in allowed range
 */
const isIPAllowed = (ip) => {
  // For development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }
  }
  
  // Check against whitelist
  return ALLOWED_IP_RANGES.includes(ip);
};

/**
 * Get client IP address
 */
const getClientIP = (req) => {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection.remoteAddress ||
         req.socket.remoteAddress;
};

/**
 * Check if user is attempting demo account login
 */
const isDemoAccount = (email) => {
  return Object.values(DEMO_ACCOUNTS).includes(email.toLowerCase());
};

/**
 * Middleware to check demo access
 */
const checkDemoAccess = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    // If not a demo account, skip this middleware
    if (!email || !isDemoAccount(email)) {
      return next();
    }
    
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'];
    
    // Check IP whitelist
    if (!isIPAllowed(clientIP)) {
      // Log unauthorized attempt
      console.warn(`Unauthorized demo access attempt from IP: ${clientIP}, Email: ${email}`);
      
      return res.status(403).json({
        success: false,
        message: 'Demo access is restricted. Please request access at /demo-access'
      });
    }
    
    // Check if user has valid demo access
    const { data: demoAccess, error } = await supabase
      .from('demo_access')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('status', 'active')
      .eq('verified', true)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !demoAccess) {
      return res.status(403).json({
        success: false,
        message: 'Demo access not found or expired. Please request access at /demo-access'
      });
    }
    
    // Get current logs and add new entry
    const currentLogs = demoAccess.access_logs || [];
    const newLog = {
      timestamp: new Date().toISOString(),
      ip_address: clientIP,
      action: 'login_attempt',
      user_agent: userAgent
    };
    
    // Keep only last 100 logs
    const updatedLogs = [...currentLogs, newLog].slice(-100);
    
    // Update access count and logs
    await supabase
      .from('demo_access')
      .update({
        access_count: (demoAccess.access_count || 0) + 1,
        last_access_at: new Date().toISOString(),
        access_logs: updatedLogs
      })
      .eq('id', demoAccess.id);
    
    // Attach demo access info to request
    req.demoAccess = demoAccess;
    
    next();
  } catch (error) {
    console.error('Demo access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking demo access'
    });
  }
};

/**
 * Middleware to log demo account activity
 */
const logDemoActivity = async (req, res, next) => {
  try {
    // Only log if user is authenticated and using demo account
    if (req.user && isDemoAccount(req.user.email)) {
      const clientIP = getClientIP(req);
      const userAgent = req.headers['user-agent'];
      const action = `${req.method} ${req.path}`;
      
      const { data: demoAccess } = await supabase
        .from('demo_access')
        .select('id, access_logs, access_count')
        .eq('email', req.user.email.toLowerCase())
        .eq('status', 'active')
        .single();
      
      if (demoAccess) {
        // Get current logs and add new entry
        const currentLogs = demoAccess.access_logs || [];
        const newLog = {
          timestamp: new Date().toISOString(),
          ip_address: clientIP,
          action: action,
          user_agent: userAgent
        };
        
        // Keep only last 100 logs
        const updatedLogs = [...currentLogs, newLog].slice(-100);
        
        await supabase
          .from('demo_access')
          .update({
            access_count: (demoAccess.access_count || 0) + 1,
            last_access_at: new Date().toISOString(),
            access_logs: updatedLogs
          })
          .eq('id', demoAccess.id);
      }
    }
    
    next();
  } catch (error) {
    console.error('Demo activity logging error:', error);
    // Don't block the request if logging fails
    next();
  }
};

/**
 * Check if demo access is expired
 */
const checkDemoExpiry = async (req, res, next) => {
  try {
    if (req.user && isDemoAccount(req.user.email)) {
      const { data: demoAccess } = await supabase
        .from('demo_access')
        .select('*')
        .eq('email', req.user.email.toLowerCase())
        .single();
      
      const isValid = demoAccess && 
                     demoAccess.verified && 
                     demoAccess.status === 'active' && 
                     new Date(demoAccess.expires_at) > new Date();
      
      if (!demoAccess || !isValid) {
        return res.status(403).json({
          success: false,
          message: 'Demo access has expired. Please request new access.'
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Demo expiry check error:', error);
    next();
  }
};

module.exports = {
  checkDemoAccess,
  logDemoActivity,
  checkDemoExpiry,
  isDemoAccount,
  getClientIP,
  DEMO_ACCOUNTS
};
