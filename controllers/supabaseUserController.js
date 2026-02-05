const supabase = require('../config/supabase');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Get all users
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, isActive } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from('user_profiles')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (role) {
      query = query.eq('role', role);
    }

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data: users, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch users'
      });
    }

    const formattedUsers = (users || []).map(user => ({
      id: user.id,
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clients ? {
        _id: user.clients.id,
        companyName: user.clients.company_name
      } : user.client_id,
      phone: user.phone,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }));

    res.status(200).json({
      success: true,
      data: formattedUsers,
      pagination: {
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID
 */
exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        clients:client_id (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const formattedUser = {
      id: user.id,
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clients || user.client_id,
      phone: user.phone,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.status(200).json({
      success: true,
      data: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create user
 */
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role = 'client', clientId, phone } = req.body;

    // Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: authError.message || 'Failed to create user'
      });
    }

    // Create user profile
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
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        )
      `)
      .single();

    if (profileError) {
      // Cleanup auth user
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({
        success: false,
        message: profileError.message || 'Failed to create user profile'
      });
    }

    await createAuditLog(req.user.id, 'CREATE', 'User', profile.id, { email, role }, req);

    const formattedUser = {
      id: profile.id,
      _id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      clientId: profile.clients || profile.client_id,
      phone: profile.phone,
      isActive: profile.is_active,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user
 */
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password, ...updateData } = req.body;

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update password in Supabase Auth if provided
    if (password) {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(id, {
        password
      });

      if (passwordError) {
        return res.status(400).json({
          success: false,
          message: passwordError.message || 'Failed to update password'
        });
      }
    }

    // Update user profile
    const profileUpdate = {
      updated_at: new Date().toISOString()
    };

    if (updateData.name !== undefined) profileUpdate.name = updateData.name;
    if (updateData.phone !== undefined) profileUpdate.phone = updateData.phone;
    if (updateData.isActive !== undefined) profileUpdate.is_active = updateData.isActive;
    if (updateData.role !== undefined) profileUpdate.role = updateData.role;
    if (updateData.clientId !== undefined) profileUpdate.client_id = updateData.clientId;

    const { data: user, error } = await supabase
      .from('user_profiles')
      .update(profileUpdate)
      .eq('id', id)
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update user'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'User', id, updateData, req);

    const formattedUser = {
      id: user.id,
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clients || user.client_id,
      phone: user.phone,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user (deactivate)
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const { data: user } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Deactivate user instead of deleting
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to deactivate user'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'User', id, null, req);

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
};
