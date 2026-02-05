const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Create client user
 */
exports.createClientUser = async (req, res, next) => {
  try {
    const { name, email, password, clientId, phone } = req.body;

    // Check if client exists - use admin client to bypass RLS
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user already exists in Supabase Auth - use admin client
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers?.users?.find(u => u.email === email);

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user in Supabase Auth - use admin client
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'client' }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: authError.message || 'Failed to create user'
      });
    }

    // Create user profile - use admin client to bypass RLS
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: authUser.user.id,
        name,
        email,
        role: 'client',
        client_id: clientId,
        phone: phone || null,
        is_active: true
      })
      .select()
      .single();

    if (profileError) {
      // Clean up auth user if profile creation fails - use admin client
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({
        success: false,
        message: profileError.message || 'Failed to create user profile'
      });
    }

    await createAuditLog(req.user.id, 'CREATE', 'User', profile.id, `Created client user: ${email}`, req);

    const userResponse = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      clientId: profile.client_id,
      phone: profile.phone,
      isActive: profile.is_active
    };

    res.status(201).json({
      success: true,
      message: 'Client user created successfully',
      data: userResponse
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get client users
 */
exports.getClientUsers = async (req, res, next) => {
  try {
    const { clientId } = req.query;

    // Use admin client to bypass RLS
    let query = supabaseAdmin
      .from('user_profiles')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        )
      `)
      .eq('role', 'client')
      .order('created_at', { ascending: false });

    if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    const { data: users, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch client users'
      });
    }

    const formattedUsers = (users || []).map(user => ({
      id: user.id,
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clients ? {
        id: user.clients.id,
        _id: user.clients.id,
        companyName: user.clients.company_name
      } : null,
      phone: user.phone,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }));

    res.status(200).json({
      success: true,
      data: formattedUsers
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update client user
 */
exports.updateClientUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, isActive } = req.body;

    // Check if user exists and is a client user - use admin client to bypass RLS
    const { data: user } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .eq('role', 'client')
      .single();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Client user not found'
      });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (isActive !== undefined) updateData.is_active = isActive;

    // Use admin client to bypass RLS
    const { data: updatedUser, error } = await supabaseAdmin
      .from('user_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update client user'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'User', id, `Updated client user: ${updatedUser.email}`, req);

    const userResponse = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      clientId: updatedUser.client_id,
      phone: updatedUser.phone,
      isActive: updatedUser.is_active
    };

    res.status(200).json({
      success: true,
      message: 'Client user updated successfully',
      data: userResponse
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete client user
 */
exports.deleteClientUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user exists and is a client user - use admin client to bypass RLS
    const { data: user } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .eq('role', 'client')
      .single();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Client user not found'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'User', id, `Deleted client user: ${user.email}`, req);

    // Delete from Supabase Auth (this will cascade delete user_profiles due to ON DELETE CASCADE)
    // Use admin client for auth admin operations
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteError) {
      return res.status(400).json({
        success: false,
        message: deleteError.message || 'Failed to delete user'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Client user deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset client password
 */
exports.resetClientPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Check if user exists and is a client user - use admin client to bypass RLS
    const { data: user } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .eq('role', 'client')
      .single();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Client user not found'
      });
    }

    // Update password in Supabase Auth - use admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: newPassword
    });

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to reset password'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'User', id, `Reset password for client user: ${user.email}`, req);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
};
