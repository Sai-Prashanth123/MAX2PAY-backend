const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Get all clients
 */
exports.getAllClients = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;
    
    // Build base query without search to avoid schema cache issues
    // Use admin client to bypass RLS
    let query = supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter by active status
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Always use post-fetch filtering for search to avoid schema cache issues
    // Supabase schema cache can sometimes not recognize company_name in .or() filters
    const usePostFilterSearch = !!search;

    // Apply pagination
    query = query.range(from, to);

    let { data: clients, error, count } = await query;

    // If query fails, return error (shouldn't happen if table structure is correct)
    if (error) {
      // Check if it's a schema cache issue
      if (error.message && (error.message.includes('company_name') || error.message.includes('schema cache'))) {
        return res.status(400).json({
          success: false,
          message: 'Database schema issue detected. Please run the diagnostic script: backend/scripts/checkClientsTableSchema.sql in Supabase SQL Editor to verify the table structure.',
          error: error.message,
          hint: 'The company_name column may be missing or the schema cache needs to be refreshed. Run fixClientsTableSchema.sql to add missing columns.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch clients',
        error: error.message
      });
    }
    
    // Apply search filter after fetch (avoids schema cache issues)
    let filteredClients = clients || [];
    if (usePostFilterSearch && clients && clients.length > 0) {
      const searchLower = search.toLowerCase();
      filteredClients = (clients || []).filter(client => {
        const companyName = (client.company_name || '').toLowerCase();
        const email = (client.email || '').toLowerCase();
        const contactPerson = (client.contact_person || '').toLowerCase();
        return companyName.includes(searchLower) || 
               email.includes(searchLower) || 
               contactPerson.includes(searchLower);
      });
      // Update count for post-filtered results (approximate)
      count = filteredClients.length;
    } else {
      filteredClients = clients || [];
    }

    // Map to match frontend expectations
    const formattedClients = (filteredClients || []).map(client => ({
      id: client.id,
      _id: client.id,
      companyName: client.company_name,
      contactPerson: client.contact_person,
      email: client.email,
      phone: client.phone,
      address: {
        street: client.address_street,
        city: client.address_city,
        state: client.address_state,
        zipCode: client.address_zip_code,
        country: client.address_country
      },
      taxId: client.tax_id,
      isActive: client.is_active,
      notes: client.notes,
      createdAt: client.created_at,
      updatedAt: client.updated_at
    }));

    res.status(200).json({
      success: true,
      data: formattedClients,
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
 * Get client by ID
 */
exports.getClientById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use admin client to bypass RLS
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // Check if error is about missing address columns
      if (error.message && error.message.includes('address_city')) {
        return res.status(400).json({
          success: false,
          message: 'Database schema error: Address columns are missing. Please run the migration script: backend/scripts/addAddressColumnsToClients.sql in Supabase SQL Editor.',
          error: error.message
        });
      }
      
      return res.status(404).json({
        success: false,
        message: error.message || 'Client not found',
        error: error.message
      });
    }
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Format response
    const formattedClient = {
      id: client.id,
      _id: client.id,
      companyName: client.company_name,
      contactPerson: client.contact_person,
      email: client.email,
      phone: client.phone,
      address: {
        street: client.address_street,
        city: client.address_city,
        state: client.address_state,
        zipCode: client.address_zip_code,
        country: client.address_country
      },
      taxId: client.tax_id,
      isActive: client.is_active,
      notes: client.notes,
      createdAt: client.created_at,
      updatedAt: client.updated_at
    };

    res.json({
      success: true,
      data: formattedClient
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new client
 */
exports.createClient = async (req, res, next) => {
  try {
    const {
      companyName,
      contactPerson,
      email,
      phone,
      address,
      taxId,
      notes,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Company name is required'
      });
    }

    if (!contactPerson || !contactPerson.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Contact person is required'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      });
    }

    // Check if client with email already exists
    // Use admin client to bypass RLS
    const { data: existingClient } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('email', email)
      .single();

    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Client with this email already exists'
      });
    }

    // Ensure address object exists
    const addressObj = address || {};
    
    // Build client data - only include address fields if they exist in the schema
    // This prevents errors if the migration hasn't been run yet
    const clientData = {
      company_name: companyName,
      contact_person: contactPerson,
      email,
      phone,
      tax_id: taxId || null,
      notes: notes || null,
      is_active: isActive
    };

    // Check if address columns exist by trying a test query
    // If they don't exist, we'll skip adding them and log a warning
    try {
      // Try to select address_city to check if column exists
      // Use admin client to bypass RLS
      const { error: testError } = await supabaseAdmin
        .from('clients')
        .select('address_city')
        .limit(0);
      
      // If no error, columns exist - add address fields
      if (!testError || testError.code !== '42703') { // 42703 = undefined_column
        clientData.address_street = addressObj.street || null;
        clientData.address_city = addressObj.city || null;
        clientData.address_state = addressObj.state || null;
        clientData.address_zip_code = addressObj.zipCode || null;
        clientData.address_country = addressObj.country || 'United States';
      } else {
        // Columns don't exist - log warning but continue without address fields
        console.warn('Address columns not found in clients table. Run addAddressColumnsToClients.sql migration.');
      }
    } catch (err) {
      // If check fails, assume columns don't exist and continue without them
      console.warn('Could not verify address columns. Continuing without address fields.');
    }

    // Use admin client to bypass RLS
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .insert(clientData)
      .select()
      .single();

    if (error) {
      // Check if error is about missing address columns
      if (error.message && error.message.includes('address_city')) {
        return res.status(400).json({
          success: false,
          message: 'Database schema error: Address columns are missing. Please run the migration script: backend/scripts/addAddressColumnsToClients.sql in Supabase SQL Editor.',
          error: error.message
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create client',
        error: error.message
      });
    }

    await createAuditLog(req.user.id, 'CREATE', 'Client', client.id, clientData, req);

    // Format response
    const formattedClient = {
      id: client.id,
      _id: client.id,
      companyName: client.company_name,
      contactPerson: client.contact_person,
      email: client.email,
      phone: client.phone,
      address: {
        street: client.address_street,
        city: client.address_city,
        state: client.address_state,
        zipCode: client.address_zip_code,
        country: client.address_country
      },
      taxId: client.tax_id,
      isActive: client.is_active,
      notes: client.notes,
      createdAt: client.created_at,
      updatedAt: client.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: formattedClient
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update client
 */
exports.updateClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      companyName,
      contactPerson,
      email,
      phone,
      address,
      taxId,
      notes,
      isActive
    } = req.body;

    // Check if client exists - use admin client to bypass RLS
    const { data: existingClient } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingClient) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if email is being changed and if new email already exists
    if (email && email !== existingClient.email) {
      const { data: emailExists } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('email', email)
        .single();

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Client with this email already exists'
        });
      }
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (companyName !== undefined) updateData.company_name = companyName;
    if (contactPerson !== undefined) updateData.contact_person = contactPerson;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    
    // Only add address fields if columns exist in schema
    if (address !== undefined) {
      try {
        // Check if address columns exist - use admin client
        const { error: testError } = await supabaseAdmin
          .from('clients')
          .select('address_city')
          .limit(0);
        
        if (!testError || testError.code !== '42703') {
          // Columns exist - add address fields
          if (address.street !== undefined) updateData.address_street = address.street;
          if (address.city !== undefined) updateData.address_city = address.city;
          if (address.state !== undefined) updateData.address_state = address.state;
          if (address.zipCode !== undefined) updateData.address_zip_code = address.zipCode;
          if (address.country !== undefined) updateData.address_country = address.country;
        }
        // If columns don't exist, silently skip address fields
      } catch (err) {
        // If check fails, skip address fields
        console.warn('Could not verify address columns. Skipping address update.');
      }
    }
    
    if (taxId !== undefined) updateData.tax_id = taxId;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.is_active = isActive;

    // Use admin client to bypass RLS
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Check if error is about missing address columns
      if (error.message && error.message.includes('address_city')) {
        return res.status(400).json({
          success: false,
          message: 'Database schema error: Address columns are missing. Please run the migration script: backend/scripts/addAddressColumnsToClients.sql in Supabase SQL Editor.',
          error: error.message
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update client',
        error: error.message
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'Client', client.id, updateData, req);

    // Format response
    const formattedClient = {
      id: client.id,
      _id: client.id,
      companyName: client.company_name,
      contactPerson: client.contact_person,
      email: client.email,
      phone: client.phone,
      address: {
        street: client.address_street,
        city: client.address_city,
        state: client.address_state,
        zipCode: client.address_zip_code,
        country: client.address_country
      },
      taxId: client.tax_id,
      isActive: client.is_active,
      notes: client.notes,
      createdAt: client.created_at,
      updatedAt: client.updated_at
    };

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: formattedClient
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete client
 */
exports.deleteClient = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if client exists - use admin client to bypass RLS
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if client has associated records (products, orders, invoices, etc.)
    // Use admin client to bypass RLS
    const [productsResult, ordersResult, invoicesResult] = await Promise.all([
      supabaseAdmin.from('products').select('id').eq('client_id', id).limit(1),
      supabaseAdmin.from('orders').select('id').eq('client_id', id).limit(1),
      supabaseAdmin.from('invoices').select('id').eq('client_id', id).limit(1)
    ]);

    if (productsResult.data?.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete client with associated products'
      });
    }

    if (ordersResult.data?.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete client with associated orders'
      });
    }

    if (invoicesResult.data?.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete client with associated invoices'
      });
    }

    // Use admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete client'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'Client', id, null, req);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get client statistics
 */
exports.getClientStats = async (req, res, next) => {
  try {
    const clientId = req.params.id;

    // Get product count - use admin client to bypass RLS
    const { count: productCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_active', true);

    // Get inventory stats - use admin client to bypass RLS
    const { data: inventoryData, error: inventoryError } = await supabaseAdmin
      .from('inventory')
      .select('total_stock, available_stock, reserved_stock, dispatched_stock')
      .eq('client_id', clientId);

    let inventoryStats = {
      totalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0
    };

    if (!inventoryError && inventoryData) {
      inventoryStats = inventoryData.reduce((acc, item) => ({
        totalStock: acc.totalStock + (item.total_stock || 0),
        availableStock: acc.availableStock + (item.available_stock || 0),
        reservedStock: acc.reservedStock + (item.reserved_stock || 0),
        dispatchedStock: acc.dispatchedStock + (item.dispatched_stock || 0)
      }), inventoryStats);
    }

    // Get order stats by status - use admin client to bypass RLS
    const { data: ordersData, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('client_id', clientId);

    const orderStats = {};
    if (!ordersError && ordersData) {
      ordersData.forEach(order => {
        orderStats[order.status] = (orderStats[order.status] || 0) + 1;
      });
    }

    res.status(200).json({
      success: true,
      data: {
        productCount: productCount || 0,
        inventory: inventoryStats,
        orders: Object.entries(orderStats).map(([status, count]) => ({
          _id: status,
          status,
          count
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};
