const supabaseAdmin = require('../config/supabaseAdmin');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');

/**
 * Setup 2FA for user
 */
exports.setup2FA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `3PL FAST (${userEmail})`,
      issuer: '3PL FAST'
    });

    // Generate backup codes (10 codes)
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      backupCodes.push(code);
    }

    // Hash backup codes before storing
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );

    // Check if 2FA already exists
    const { data: existing } = await supabaseAdmin
      .from('user_2fa')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      // Update existing
      await supabaseAdmin
        .from('user_2fa')
        .update({
          secret: secret.base32,
          backup_codes: hashedBackupCodes,
          is_enabled: false, // Not enabled until verified
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    } else {
      // Create new
      await supabaseAdmin
        .from('user_2fa')
        .insert({
          user_id: userId,
          secret: secret.base32,
          backup_codes: hashedBackupCodes,
          is_enabled: false
        });
    }

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        backupCodes: backupCodes, // Send plain codes to user (only shown once)
        manualEntryKey: secret.base32
      },
      message: 'Scan the QR code with your authenticator app'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Verify and enable 2FA
 */
exports.verify2FA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Get user's 2FA secret
    const { data: user2FA, error } = await supabaseAdmin
      .from('user_2fa')
      .select('secret')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !user2FA) {
      return res.status(404).json({
        success: false,
        message: '2FA not set up for this user'
      });
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: user2FA.secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps before/after
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Enable 2FA
    await supabaseAdmin
      .from('user_2fa')
      .update({
        is_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    res.status(200).json({
      success: true,
      message: '2FA enabled successfully'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Validate 2FA token during login
 */
exports.validate2FAToken = async (req, res, next) => {
  try {
    const { userId, token, isBackupCode } = req.body;

    if (!userId || !token) {
      return res.status(400).json({
        success: false,
        message: 'User ID and token are required'
      });
    }

    // Get user's 2FA settings
    const { data: user2FA, error } = await supabaseAdmin
      .from('user_2fa')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (error || !user2FA) {
      return res.status(404).json({
        success: false,
        message: '2FA not enabled for this user'
      });
    }

    let verified = false;

    if (isBackupCode) {
      // Verify backup code
      for (const hashedCode of user2FA.backup_codes || []) {
        const match = await bcrypt.compare(token, hashedCode);
        if (match) {
          verified = true;
          // Remove used backup code
          const updatedCodes = user2FA.backup_codes.filter(c => c !== hashedCode);
          await supabaseAdmin
            .from('user_2fa')
            .update({ backup_codes: updatedCodes })
            .eq('user_id', userId);
          break;
        }
      }
    } else {
      // Verify TOTP token
      verified = speakeasy.totp.verify({
        secret: user2FA.secret,
        encoding: 'base32',
        token: token,
        window: 2
      });
    }

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid 2FA code'
      });
    }

    res.status(200).json({
      success: true,
      message: '2FA verification successful'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Disable 2FA
 */
exports.disable2FA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to disable 2FA'
      });
    }

    // Verify password (you'll need to implement password verification)
    // For now, we'll just disable it

    await supabaseAdmin
      .from('user_2fa')
      .update({
        is_enabled: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    res.status(200).json({
      success: true,
      message: '2FA disabled successfully'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get 2FA status
 */
exports.get2FAStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: user2FA } = await supabaseAdmin
      .from('user_2fa')
      .select('is_enabled, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    res.status(200).json({
      success: true,
      data: {
        enabled: user2FA?.is_enabled || false,
        setupDate: user2FA?.created_at || null
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Regenerate backup codes
 */
exports.regenerateBackupCodes = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Generate new backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      backupCodes.push(code);
    }

    // Hash backup codes
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );

    // Update in database
    await supabaseAdmin
      .from('user_2fa')
      .update({
        backup_codes: hashedBackupCodes,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    res.status(200).json({
      success: true,
      data: {
        backupCodes: backupCodes
      },
      message: 'Backup codes regenerated successfully'
    });

  } catch (error) {
    next(error);
  }
};
