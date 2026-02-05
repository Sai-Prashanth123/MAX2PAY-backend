const supabase = require('../config/supabase');

/**
 * Register new user with Supabase Auth
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'client', clientId, phone } = req.body;

    // Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: authError.message || 'Failed to create user'
      });
    }

    // Create user profile in user_profiles table
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authUser.user.id,
        name,
        email,
        role,
        client_id: clientId || null,
        phone: phone || null,
        is_active: true
      })
      .select()
      .single();

    if (profileError) {
      // Cleanup: delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({
        success: false,
        message: profileError.message || 'Failed to create user profile'
      });
    }

    const accessToken = authUser.session?.access_token;
    
    res
      .cookie('sb-access-token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      })
      .status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: profile,
          session: {
            access_token: accessToken // Include token in response for frontend to store
          }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user with Supabase Auth
 */
exports.login = async (req, res, next) => {  
  try {
    const { email, password } = req.body;

    if (!email || !password) {      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Authenticate with Supabase    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (authError || !authData.user) {      
      // Log failed login attempt
      const { createLoginAudit } = require('./supabaseSecurityController');
      const clientIP = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      await createLoginAudit(null, email, clientIP.replace(/^::ffff:/, ''), userAgent, 'failed', authError?.message, req);
      
      return res.status(401).json({
        success: false,
        message: authError?.message || 'Invalid email or password'
      });
    }

    // Get user profile (use service role for RLS bypass)
    // Use singleton admin client instead of creating new one each request
    const supabaseAdmin = require('../config/supabaseAdmin');
    const serviceRoleSupabase = supabaseAdmin;    
    const { data: profileData, error: profileError } = await serviceRoleSupabase
      .from('user_profiles')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email,
          contact_person,
          phone
        )
      `)
      .eq('id', authData.user.id)
      .single();

    let profile = profileData;
    // Handle missing profile or API key errors
    if (profileError) {
      // Check if it's an API key error
      if (profileError.message && profileError.message.includes('Invalid API key')) {        return res.status(500).json({
          success: false,
          message: 'Server configuration error: Invalid service role API key. Please check your SUPABASE_SERVICE_ROLE_KEY in backend/.env'
        });
      }
      
      // Check if profile doesn't exist (PGRST116 = not found)
      if (profileError.code === 'PGRST116' || profileError.message.includes('No rows')) {
        // Try to create profile from auth user metadata        
        // Create profile from auth user data
        const { data: newProfile, error: createError } = await serviceRoleSupabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            name: authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || 'User',
            email: authData.user.email,
            role: authData.user.user_metadata?.role || 'client',
            client_id: null,
            phone: null,
            is_active: true
          })
          .select()
          .single();
        
        if (createError || !newProfile) {          return res.status(401).json({
            success: false,
            message: 'User profile not found and could not be created. Please contact support.'
          });
        }
        
        // Use the newly created profile
        profile = newProfile;
        
        // If this is a client user without a client_id, try to assign one
        if (profile.role === 'client' && !profile.client_id) {
          // Try to find the first available client and assign it
          const { data: firstClient } = await serviceRoleSupabase
            .from('clients')
            .select('id')
            .limit(1)
            .single();
          
          if (firstClient) {
            await serviceRoleSupabase
              .from('user_profiles')
              .update({ client_id: firstClient.id })
              .eq('id', profile.id);
            profile.client_id = firstClient.id;
          }
        }
      } else {        return res.status(401).json({
          success: false,
          message: 'User profile not found'
        });
      }
    }

    if (!profile) {      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Check if user is active
    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if 2FA is enabled for this user
    const { data: user2FA } = await serviceRoleSupabase
      .from('user_2fa')
      .select('is_enabled')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    const clientIP = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (user2FA?.is_enabled) {
      // 2FA is enabled - require 2FA verification
      const { createLoginAudit } = require('./supabaseSecurityController');
      await createLoginAudit(authData.user.id, email, clientIP.replace(/^::ffff:/, ''), userAgent, '2fa_required', null, req);
      
      return res.status(200).json({
        success: true,
        requires2FA: true,
        userId: authData.user.id,
        message: 'Please enter your 2FA code'
      });
    }

    // Update last login
    await supabase
      .from('user_profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', authData.user.id);

    // Format response for compatibility with existing frontend
    // For client users, include client information if available
    let clientInfo = null;
    if (profile.client_id && profile.clients) {
      clientInfo = {
        _id: profile.clients.id,
        id: profile.clients.id,
        companyName: profile.clients.company_name,
        company_name: profile.clients.company_name,
        email: profile.clients.email,
        contactPerson: profile.clients.contact_person,
        phone: profile.clients.phone
      };
    }

    const userResponse = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      clientId: profile.client_id,
      client_id: profile.client_id, // Include both formats for compatibility
      client: clientInfo, // Include full client object if available
      phone: profile.phone,
      avatar_url: profile.avatar_url,
      isActive: profile.is_active
    };

    // Log successful login
    const { createLoginAudit } = require('./supabaseSecurityController');
    await createLoginAudit(authData.user.id, email, clientIP.replace(/^::ffff:/, ''), userAgent, 'success', null, req);

    // Set Supabase access token in httpOnly cookie for backend auth middleware
    const accessToken = authData.session?.access_token;

    if (!accessToken) {      return res.status(500).json({
        success: false,
        message: 'Authentication failed: No session token received'
      });
    }
    res
      .cookie('sb-access-token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      })
      .json({
        success: true,
        message: 'Login successful',
        data: {
          user: userResponse,
          session: {
            access_token: accessToken // Include token in response for frontend to store
          }
        }
      });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user
 */
exports.getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user profile with client info (use service role to bypass RLS)
    const supabaseAdmin = require('../config/supabaseAdmin');
    const { data: profile, error } = await supabaseAdmin
      .from('user_profiles')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Format response for compatibility
    // Build client info object if client relationship exists
    let clientInfo = null;
    if (profile.client_id && profile.clients) {
      clientInfo = {
        _id: profile.clients.id,
        id: profile.clients.id,
        companyName: profile.clients.company_name,
        company_name: profile.clients.company_name,
        email: profile.clients.email
      };
    }

    const userResponse = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      clientId: profile.client_id,
      client_id: profile.client_id, // Include both formats for compatibility
      client: clientInfo, // Include full client object if available
      phone: profile.phone,
      avatar_url: profile.avatar_url,
      isActive: profile.is_active,
      lastLogin: profile.last_login
    };

    res.json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, phone, avatar_url } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update profile'
      });
    }

    // Format response
    const userResponse = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      clientId: profile.client_id,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
      isActive: profile.is_active
    };

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userResponse
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password
 */
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Get user email from profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword
    });

    if (verifyError) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to update password'
      });
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot Password - Send reset email
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log('=== PASSWORD RESET REQUEST ===');
    console.log('Email:', email);
    console.log('Frontend URL:', process.env.CLIENT_URL || 'https://lemon-smoke-0bf242700.2.azurestaticapps.net');

    // Send password reset email using Supabase Auth
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CLIENT_URL || 'https://lemon-smoke-0bf242700.2.azurestaticapps.net'}/reset-password`
    });

    if (error) {
      console.error('❌ Password reset error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    }

    console.log('✅ Password reset email sent successfully');
    console.log('Response data:', data);

    res.status(200).json({
      success: true,
      message: 'Password reset instructions have been sent to your email (if account exists).'
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    console.error('Error stack:', error.stack);
    // Don't reveal errors for security
    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, you will receive password reset instructions.'
    });
  }
};

/**
 * Logout
 */
exports.logout = async (req, res, next) => {
  try {
    // Clear the Supabase access token cookie
    res.cookie('sb-access-token', 'none', {
      expires: new Date(Date.now() + 10 * 1000), // Expire in 10 seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};
