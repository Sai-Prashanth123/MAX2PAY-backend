const supabase = require('../config/supabase');
const crypto = require('crypto');
const { getClientIP } = require('../middleware/demoAccess');

/**
 * Demo Access Controller (Supabase)
 * Handles demo account access requests, email verification, and monitoring
 */

// Demo access duration (in hours)
const DEMO_ACCESS_DURATION = 24; // 24 hours

/**
 * Request demo access
 * POST /api/demo-access/request
 */
exports.requestDemoAccess = async (req, res) => {
  try {
    const { email, demoType } = req.body;
    
    // Validate input
    if (!email || !demoType) {
      return res.status(400).json({
        success: false,
        message: 'Email and demo type are required'
      });
    }
    
    if (!['admin', 'client'].includes(demoType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid demo type. Must be "admin" or "client"'
      });
    }
    
    // Check for existing active access
    const { data: existingAccess } = await supabase
      .from('demo_access')
      .select('*')
      .eq('email', email.toLowerCase())
      .in('status', ['pending', 'active'])
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .single();
    
    if (existingAccess) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active or pending demo access request'
      });
    }
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Get client info
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'];
    
    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DEMO_ACCESS_DURATION);
    
    // Create demo access record
    const { data: demoAccess, error: insertError } = await supabase
      .from('demo_access')
      .insert({
        email: email.toLowerCase(),
        verification_token: verificationToken,
        ip_address: clientIP,
        user_agent: userAgent,
        expires_at: expiresAt.toISOString(),
        demo_type: demoType,
        status: 'pending',
        verified: false,
        access_count: 0
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error creating demo access:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Error requesting demo access'
      });
    }
    
    // In production, send verification email here
    // For now, return the verification link
    const verificationLink = `${process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://lemon-smoke-0bf242700.2.azurestaticapps.net'}/demo-verify/${verificationToken}`;
    
    // TODO: Send email with verification link
    console.log(`Demo access verification link: ${verificationLink}`);
    
    res.status(201).json({
      success: true,
      message: 'Demo access requested. Please check your email for verification link.',
      data: {
        email: demoAccess.email,
        demoType: demoAccess.demo_type,
        expiresAt: demoAccess.expires_at,
        // Only include verification link in development
        ...(process.env.NODE_ENV === 'development' && { verificationLink })
      }
    });
  } catch (error) {
    console.error('Request demo access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting demo access'
    });
  }
};

/**
 * Verify demo access
 * POST /api/demo-access/verify/:token
 */
exports.verifyDemoAccess = async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }
    
    // Find demo access by token
    const { data: demoAccess, error: findError } = await supabase
      .from('demo_access')
      .select('*')
      .eq('verification_token', token)
      .eq('status', 'pending')
      .single();
    
    if (findError || !demoAccess) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }
    
    // Check if expired
    if (new Date(demoAccess.expires_at) < new Date()) {
      await supabase
        .from('demo_access')
        .update({ status: 'expired' })
        .eq('id', demoAccess.id);
      
      return res.status(400).json({
        success: false,
        message: 'Verification token has expired. Please request new access.'
      });
    }
    
    // Verify the access
    const { error: updateError } = await supabase
      .from('demo_access')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        status: 'active'
      })
      .eq('id', demoAccess.id);
    
    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error verifying demo access'
      });
    }
    
    // Get demo credentials based on type
    const credentials = {
      admin: {
        email: 'admin@demo3pl.com',
        password: 'Admin@123'
      },
      client: {
        email: 'client@demo3pl.com',
        password: 'Client@123'
      }
    };
    
    res.json({
      success: true,
      message: 'Demo access verified successfully',
      data: {
        demoType: demoAccess.demo_type,
        credentials: credentials[demoAccess.demo_type],
        expiresAt: demoAccess.expires_at,
        validFor: `${DEMO_ACCESS_DURATION} hours`
      }
    });
  } catch (error) {
    console.error('Verify demo access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying demo access'
    });
  }
};

/**
 * Get demo access status
 * GET /api/demo-access/status/:email
 */
exports.getDemoAccessStatus = async (req, res) => {
  try {
    const { email } = req.params;
    
    const { data: demoAccess, error } = await supabase
      .from('demo_access')
      .select('*')
      .eq('email', email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !demoAccess) {
      return res.status(404).json({
        success: false,
        message: 'No demo access found for this email'
      });
    }
    
    // Check if valid
    const isValid = demoAccess.verified && 
                   demoAccess.status === 'active' && 
                   new Date(demoAccess.expires_at) > new Date();
    
    res.json({
      success: true,
      data: {
        email: demoAccess.email,
        status: demoAccess.status,
        verified: demoAccess.verified,
        demoType: demoAccess.demo_type,
        expiresAt: demoAccess.expires_at,
        accessCount: demoAccess.access_count || 0,
        lastAccessAt: demoAccess.last_access_at,
        isValid
      }
    });
  } catch (error) {
    console.error('Get demo access status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting demo access status'
    });
  }
};

/**
 * Get demo access logs (Admin only)
 * GET /api/demo-access/logs/:email
 */
exports.getDemoAccessLogs = async (req, res) => {
  try {
    const { email } = req.params;
    const { limit = 50 } = req.query;
    
    const { data: demoAccess, error } = await supabase
      .from('demo_access')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    
    if (error || !demoAccess) {
      return res.status(404).json({
        success: false,
        message: 'No demo access found for this email'
      });
    }
    
    // Get access logs from JSONB column
    const logs = (demoAccess.access_logs || []).slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        email: demoAccess.email,
        totalAccess: demoAccess.access_count || 0,
        logs: logs
      }
    });
  } catch (error) {
    console.error('Get demo access logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting demo access logs'
    });
  }
};

/**
 * Revoke demo access (Admin only)
 * DELETE /api/demo-access/revoke/:email
 */
exports.revokeDemoAccess = async (req, res) => {
  try {
    const { email } = req.params;
    
    const { data: demoAccess, error: findError } = await supabase
      .from('demo_access')
      .select('*')
      .eq('email', email.toLowerCase())
      .in('status', ['pending', 'active'])
      .single();
    
    if (findError || !demoAccess) {
      return res.status(404).json({
        success: false,
        message: 'No active demo access found for this email'
      });
    }
    
    const { error: updateError } = await supabase
      .from('demo_access')
      .update({ status: 'revoked' })
      .eq('id', demoAccess.id);
    
    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error revoking demo access'
      });
    }
    
    res.json({
      success: true,
      message: 'Demo access revoked successfully'
    });
  } catch (error) {
    console.error('Revoke demo access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking demo access'
    });
  }
};

/**
 * Get all demo access records (Admin only)
 * GET /api/demo-access/all
 */
exports.getAllDemoAccess = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let query = supabase
      .from('demo_access')
      .select('*', { count: 'exact' });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const { data: records, error, count } = await query
      .order('created_at', { ascending: false })
      .range(skip, skip + parseInt(limit) - 1);
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all demo access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting demo access records'
    });
  }
};

/**
 * Cleanup expired demo access (Cron job)
 * POST /api/demo-access/cleanup
 */
exports.cleanupExpired = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('demo_access')
      .update({ status: 'expired' })
      .lt('expires_at', new Date().toISOString())
      .neq('status', 'expired')
      .select();
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      message: 'Expired demo access cleaned up',
      data: {
        modifiedCount: data?.length || 0
      }
    });
  } catch (error) {
    console.error('Cleanup expired error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up expired demo access'
    });
  }
};

/**
 * Reset demo credentials (Admin only)
 * POST /api/demo-access/reset-credentials
 */
exports.resetDemoCredentials = async (req, res) => {
  try {
    const { demoType } = req.body;
    
    if (!['admin', 'client'].includes(demoType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid demo type'
      });
    }
    
    // In production, this would:
    // 1. Generate new random password
    // 2. Update the demo user account
    // 3. Invalidate all existing demo access tokens
    // 4. Notify via email
    
    // For now, just log the action
    console.log(`Demo credentials reset requested for: ${demoType}`);
    
    res.json({
      success: true,
      message: `Demo credentials for ${demoType} will be reset. All active access will be revoked.`
    });
  } catch (error) {
    console.error('Reset demo credentials error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting demo credentials'
    });
  }
};

module.exports = exports;
