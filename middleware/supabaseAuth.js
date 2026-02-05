const supabase = require('../config/supabase');

/**
 * Supabase Authentication Middleware
 * Verifies Supabase JWT token and attaches user to request
 */
const protect = async (req, res, next) => {
  try {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies['sb-access-token']) {
      // Fallback to httpOnly cookie set on login
      token = req.cookies['sb-access-token'];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token'
      });
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, invalid token'
      });
    }

    // Get user profile from user_profiles table (use service role for RLS bypass)
    // Use singleton admin client instead of creating new one each request
    const supabaseAdmin = require('../config/supabaseAdmin');
    const serviceRoleSupabase = supabaseAdmin;
    const { data: profile, error: profileError } = await serviceRoleSupabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Attach user to request (normalize field names for compatibility)
    req.user = {
      _id: user.id,
      id: user.id,
      email: user.email,
      ...profile,
      clientId: profile.client_id, // Map client_id to clientId for compatibility
      client_id: profile.client_id, // Also keep snake_case for compatibility
      isActive: profile.is_active, // Map is_active to isActive
      role: profile.role
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Not authorized, token failed'
    });
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    next();
  };
};

/**
 * Restrict client users to their own client data
 */
const restrictToOwnClient = async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      return next();
    }

    if (req.user.role === 'client') {
      const userClientId = req.user.client_id || req.user.clientId;
      const requestedClientId = req.params.clientId || req.body.clientId || req.query.clientId;
      
      // If a specific clientId is requested, verify it matches the user's client_id
      if (requestedClientId && requestedClientId !== 'null' && requestedClientId !== 'undefined') {
        if (requestedClientId !== userClientId) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to access this client data'
          });
        }
      }
      // If no clientId is requested, the controller will filter by user's client_id automatically
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect, authorize, restrictToOwnClient };
