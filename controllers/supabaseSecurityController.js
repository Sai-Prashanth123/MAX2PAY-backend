const supabaseAdmin = require('../config/supabaseAdmin');
const { logActivity } = require('../middleware/activityLogger');

/**
 * IP Whitelist Management
 */

// Get all IP whitelist entries
exports.getAllIPWhitelist = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: entries, error, count } = await supabaseAdmin
      .from('ip_whitelist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    next(error);
  }
};

// Add IP to whitelist
exports.addIPWhitelist = async (req, res, next) => {
  try {
    const { ip_address, description, user_id } = req.body;

    if (!ip_address) {
      return res.status(400).json({
        success: false,
        message: 'IP address is required'
      });
    }

    // Validate IP format (basic validation)
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (!ipRegex.test(ip_address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IP address format'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('ip_whitelist')
      .insert({
        ip_address,
        description,
        user_id,
        created_by: req.user.id,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({
          success: false,
          message: 'IP address already exists in whitelist'
        });
      }
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    await logActivity(
      req.user.id,
      'IP_WHITELIST_ADD',
      'ip_whitelist',
      data.id,
      `Added IP ${ip_address} to whitelist`,
      { ip_address, description },
      req
    );

    res.status(201).json({
      success: true,
      data,
      message: 'IP address added to whitelist'
    });

  } catch (error) {
    next(error);
  }
};

// Update IP whitelist entry
exports.updateIPWhitelist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description, is_active } = req.body;

    const updateData = {};
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('ip_whitelist')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    await logActivity(
      req.user.id,
      'IP_WHITELIST_UPDATE',
      'ip_whitelist',
      id,
      `Updated IP whitelist entry`,
      updateData,
      req
    );

    res.status(200).json({
      success: true,
      data,
      message: 'IP whitelist entry updated'
    });

  } catch (error) {
    next(error);
  }
};

// Delete IP whitelist entry
exports.deleteIPWhitelist = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('ip_whitelist')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    await logActivity(
      req.user.id,
      'IP_WHITELIST_DELETE',
      'ip_whitelist',
      id,
      `Deleted IP whitelist entry`,
      {},
      req
    );

    res.status(200).json({
      success: true,
      message: 'IP whitelist entry deleted'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Login Audit
 */

// Get login audit logs
exports.getLoginAudit = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, status, startDate, endDate } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('login_audit')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter by user (if not admin, only show own logs)
    if (req.user.role !== 'admin') {
      query = query.eq('user_id', req.user.id);
    } else if (userId) {
      query = query.eq('user_id', userId);
    }

    // Filter by status
    if (status) {
      query = query.eq('login_status', status);
    }

    // Date range filter
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    query = query.range(from, to);

    const { data: logs, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    next(error);
  }
};

// Create login audit log
exports.createLoginAudit = async (userId, email, ipAddress, userAgent, status, failureReason, req) => {
  try {
    const auditData = {
      user_id: userId,
      email: email,
      ip_address: ipAddress,
      user_agent: userAgent,
      login_status: status,
      failure_reason: failureReason,
      location: {} // Can be enhanced with IP geolocation
    };

    await supabaseAdmin
      .from('login_audit')
      .insert(auditData);

  } catch (error) {
    console.error('Login audit error:', error);
  }
};

/**
 * User Activity Timeline
 */

// Get user activity timeline
exports.getUserActivity = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50, activityType, entityType, startDate, endDate } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    let query = supabaseAdmin
      .from('user_activity')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Filters
    if (activityType) {
      query = query.eq('activity_type', activityType);
    }
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    query = query.range(from, to);

    const { data: activities, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get current user's activity
exports.getMyActivity = async (req, res, next) => {
  try {
    req.params.userId = req.user.id;
    return exports.getUserActivity(req, res, next);
  } catch (error) {
    next(error);
  }
};

// Get activity statistics
exports.getActivityStats = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get activity counts by type
    const { data: activities, error } = await supabaseAdmin
      .from('user_activity')
      .select('activity_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Aggregate by activity type
    const activityCounts = {};
    const dailyActivity = {};

    activities.forEach(activity => {
      // Count by type
      activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1;

      // Count by day
      const day = activity.created_at.split('T')[0];
      dailyActivity[day] = (dailyActivity[day] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      data: {
        totalActivities: activities.length,
        activityByType: activityCounts,
        dailyActivity: dailyActivity,
        period: `${days} days`
      }
    });

  } catch (error) {
    next(error);
  }
};
