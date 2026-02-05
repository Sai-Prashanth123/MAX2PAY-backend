const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Generate 2FA secret
 * GET /api/two-factor/status
 */
exports.generateSecret = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user profile from Supabase - use admin client to bypass RLS
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `3PL WMS (${userProfile.email})`,
      issuer: '3PL WMS'
    });

    // Update user profile with secret (not enabled yet) - use admin client to bypass RLS
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        two_factor_secret: secret.base32,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error saving 2FA secret'
      });
    }

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Create audit log
    await createAuditLog(
      userId,
      'generate_2fa_secret',
      'user',
      userId,
      { email: userProfile.email },
      req
    );

    res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify and enable 2FA
 * POST /api/two-factor/verify-enable
 */
exports.verifyAndEnable = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Please provide verification token'
      });
    }

    // Get user profile with secret - use admin client to bypass RLS
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('two_factor_secret, email')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile || !userProfile.two_factor_secret) {
      return res.status(400).json({
        success: false,
        message: 'No 2FA secret found. Please generate a new secret.'
      });
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: userProfile.two_factor_secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Enable 2FA - use admin client to bypass RLS
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        two_factor_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error enabling 2FA'
      });
    }

    // Create audit log
    await createAuditLog(
      userId,
      'enable_2fa',
      'user',
      userId,
      { email: userProfile.email },
      req
    );

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disable 2FA
 * POST /api/two-factor/disable
 */
exports.disable = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Please provide verification token'
      });
    }

    // Get user profile with secret - use admin client to bypass RLS
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('two_factor_secret, two_factor_enabled, email')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile || !userProfile.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FA is not enabled'
      });
    }

    // Verify token before disabling
    const verified = speakeasy.totp.verify({
      secret: userProfile.two_factor_secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Disable 2FA - use admin client to bypass RLS
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error disabling 2FA'
      });
    }

    // Create audit log
    await createAuditLog(
      userId,
      'disable_2fa',
      'user',
      userId,
      { email: userProfile.email },
      req
    );

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify 2FA token (for login)
 * POST /api/two-factor/verify
 */
exports.verify = async (req, res, next) => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide token and user ID'
      });
    }

    // Get user profile with secret - use admin client to bypass RLS
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile || !userProfile.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FA is not enabled for this user'
      });
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: userProfile.two_factor_secret,
      encoding: 'base32',
      token: token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token verified successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get 2FA status
 * GET /api/two-factor/status
 */
exports.getStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user profile - use admin client to bypass RLS
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('two_factor_enabled')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        enabled: userProfile.two_factor_enabled || false
      }
    });
  } catch (error) {
    next(error);
  }
};
