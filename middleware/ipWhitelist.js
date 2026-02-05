const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * IP Whitelist Middleware
 * Checks if the request IP is whitelisted
 */
const checkIPWhitelist = async (req, res, next) => {
  try {
    // Get client IP address
    const clientIP = req.ip || 
                     req.headers['x-forwarded-for']?.split(',')[0] || 
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress;

    // Clean IP (remove ::ffff: prefix for IPv4)
    const cleanIP = clientIP.replace(/^::ffff:/, '');

    // Check if IP whitelisting is enabled (via env variable)
    const ipWhitelistEnabled = process.env.IP_WHITELIST_ENABLED === 'true';

    if (!ipWhitelistEnabled) {
      // IP whitelisting disabled, allow all
      req.clientIP = cleanIP;
      return next();
    }

    // Check if IP is in whitelist
    const { data: whitelistEntry, error } = await supabaseAdmin
      .from('ip_whitelist')
      .select('*')
      .eq('ip_address', cleanIP)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('IP whitelist check error:', error);
      return res.status(500).json({
        success: false,
        message: 'IP whitelist check failed'
      });
    }

    if (!whitelistEntry) {
      // IP not whitelisted
      console.warn(`Access denied for IP: ${cleanIP}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your IP address is not whitelisted.',
        ip: cleanIP
      });
    }

    // IP is whitelisted, allow access
    req.clientIP = cleanIP;
    req.whitelistEntry = whitelistEntry;
    next();

  } catch (error) {
    console.error('IP whitelist middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'IP whitelist check failed'
    });
  }
};

/**
 * Check if IP whitelisting is enabled
 */
const isIPWhitelistEnabled = () => {
  return process.env.IP_WHITELIST_ENABLED === 'true';
};

module.exports = {
  checkIPWhitelist,
  isIPWhitelistEnabled
};
