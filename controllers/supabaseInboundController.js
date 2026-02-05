const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Get all inbound logs
 */
exports.getAllInboundLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, clientId, startDate, endDate } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Get inbound logs with client and product data - use admin client to bypass RLS
    let query = supabaseAdmin
      .from('inbound_logs')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        ),
        products:product_id (
          id,
          name,
          sku
        )
      `, { count: 'exact' })
      .order('received_date', { ascending: false })
      .range(from, to);

    // Filter by client
    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    // Date filters
    if (startDate) {
      query = query.gte('received_date', startDate);
    }
    if (endDate) {
      query = query.lte('received_date', endDate);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch inbound logs'
      });
    }

    // Format response with client and product data
    const formattedLogs = (logs || []).map(log => ({
      id: log.id,
      _id: log.id,
      clientId: log.clients ? {
        _id: log.clients.id,
        id: log.clients.id,
        companyName: log.clients.company_name
      } : { id: log.client_id, companyName: 'Unknown Client' },
      productId: log.products ? {
        _id: log.products.id,
        id: log.products.id,
        name: log.products.name,
        sku: log.products.sku
      } : { id: log.product_id, name: 'Unknown Product' },
      quantity: log.quantity,
      referenceNumber: log.reference_number,
      storageLocation: log.storage_location,
      receivedDate: log.received_date,
      receivedBy: log.received_by,
      status: log.status,
      notes: log.notes,
      rejectedQuantity: log.rejected_quantity || 0,
      rejectionReason: log.rejection_reason,
      acceptedQuantity: log.accepted_quantity,
      createdAt: log.created_at,
      updatedAt: log.updated_at
    }));

    res.status(200).json({
      success: true,
      data: formattedLogs,
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
 * Create inbound log
 */
exports.createInboundLog = async (req, res, next) => {
  try {
    const { clientId, productId, quantity, referenceNumber, storageLocation, notes, status } = req.body;

    if (!quantity || quantity <= 0 || !Number.isInteger(Number(quantity))) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive whole number'
      });
    }

    // Validate status
    const validStatuses = ['pending', 'received'];
    const inboundStatus = status || 'pending'; // Default to pending
    if (!validStatuses.includes(inboundStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "pending" or "received"'
      });
    }

    // Verify product exists - use admin client to bypass RLS
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Create inbound log
    const logData = {
      client_id: clientId,
      product_id: productId,
      quantity: parseInt(quantity),
      reference_number: referenceNumber,
      storage_location: storageLocation,
      received_by: req.user.id,
      status: inboundStatus,
      notes: notes || null
    };

    // Use admin client to bypass RLS
    const { data: inboundLog, error: logError } = await supabaseAdmin
      .from('inbound_logs')
      .insert(logData)
      .select()
      .single();

    if (logError) {
      return res.status(400).json({
        success: false,
        message: logError.message || 'Failed to create inbound log'
      });
    }

    // Only update inventory if status is 'received', not 'pending'
    if (inboundStatus === 'received') {
      // Update inventory (use Supabase inventory) - use admin client to bypass RLS
      const { data: existingInventory } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('product_id', productId)
        .eq('client_id', clientId)
        .single();

      if (!existingInventory) {
        // Create new inventory record - use admin client to bypass RLS
        await supabaseAdmin
          .from('inventory')
          .insert({
            product_id: productId,
            client_id: clientId,
            total_stock: quantity,
            available_stock: quantity,
            reserved_stock: 0,
            dispatched_stock: 0,
            storage_location: storageLocation
          });
      } else {
        // Update existing inventory - use admin client to bypass RLS
        const newTotalStock = existingInventory.total_stock + quantity;
        const newAvailableStock = existingInventory.available_stock + quantity;

        await supabaseAdmin
          .from('inventory')
          .update({
            total_stock: newTotalStock,
            available_stock: newAvailableStock,
            storage_location: storageLocation,
            last_updated: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingInventory.id);
      }
    }

    await createAuditLog(
      req.user.id,
      'INBOUND_ENTRY',
      'InboundLog',
      inboundLog.id,
      { quantity, productId, clientId },
      req
    );

    // Fetch populated log for response - use admin client to bypass RLS
    const { data: populatedLog } = await supabaseAdmin
      .from('inbound_logs')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        ),
        products:product_id (
          id,
          name,
          sku
        )
      `)
      .eq('id', inboundLog.id)
      .single();

    const formattedLog = {
      id: populatedLog.id,
      _id: populatedLog.id,
      clientId: populatedLog.clients ? {
        _id: populatedLog.clients.id,
        companyName: populatedLog.clients.company_name
      } : populatedLog.client_id,
      productId: populatedLog.products ? {
        _id: populatedLog.products.id,
        name: populatedLog.products.name,
        sku: populatedLog.products.sku
      } : populatedLog.product_id,
      quantity: populatedLog.quantity,
      referenceNumber: populatedLog.reference_number,
      storageLocation: populatedLog.storage_location,
      receivedDate: populatedLog.received_date,
      receivedBy: populatedLog.received_by,
      status: populatedLog.status,
      notes: populatedLog.notes,
      createdAt: populatedLog.created_at,
      updatedAt: populatedLog.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'Inbound entry created successfully',
      data: formattedLog
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update inbound log
 */
exports.updateInboundLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes, rejectedQuantity, rejectionReason, acceptedQuantity } = req.body;

    // Check if log exists - use admin client to bypass RLS
    const { data: existingLog } = await supabaseAdmin
      .from('inbound_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingLog) {
      return res.status(404).json({
        success: false,
        message: 'Inbound log not found'
      });
    }

    // Validate status transition
    const validStatuses = ['pending', 'received', 'rejected', 'returned', 'damaged', 'partial'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (rejectedQuantity !== undefined) updateData.rejected_quantity = rejectedQuantity;
    if (rejectionReason !== undefined) updateData.rejection_reason = rejectionReason;
    if (acceptedQuantity !== undefined) updateData.accepted_quantity = acceptedQuantity;

    // Use admin client to bypass RLS
    const { data: log, error } = await supabaseAdmin
      .from('inbound_logs')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        ),
        products:product_id (
          id,
          name,
          sku
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update inbound log'
      });
    }

    // Update inventory based on status changes
    // Calculate old and new accepted quantities
    const oldAcceptedQty = existingLog.status === 'received' 
      ? existingLog.quantity 
      : (existingLog.accepted_quantity || 0);
    
    const newAcceptedQty = status === 'received' 
      ? existingLog.quantity 
      : status === 'partial' 
        ? (acceptedQuantity !== undefined ? acceptedQuantity : oldAcceptedQty)
        : 0; // For rejected/returned/damaged, accepted quantity is 0

    // Calculate the difference to adjust inventory
    const inventoryAdjustment = newAcceptedQty - oldAcceptedQty;

    // Only update inventory if there's a change in accepted quantity
    if (inventoryAdjustment !== 0) {
      const { data: existingInventory } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('product_id', existingLog.product_id)
        .eq('client_id', existingLog.client_id)
        .single();

      if (!existingInventory) {
        // Create new inventory record (only if adding stock)
        if (inventoryAdjustment > 0) {
          await supabaseAdmin
            .from('inventory')
            .insert({
              product_id: existingLog.product_id,
              client_id: existingLog.client_id,
              total_stock: inventoryAdjustment,
              available_stock: inventoryAdjustment,
              reserved_stock: 0,
              dispatched_stock: 0,
              storage_location: existingLog.storage_location
            });
        }
      } else {
        // Update existing inventory by adding/subtracting the difference
        const newTotalStock = existingInventory.total_stock + inventoryAdjustment;
        const newAvailableStock = existingInventory.available_stock + inventoryAdjustment;

        // Prevent negative stock
        if (newTotalStock >= 0 && newAvailableStock >= 0) {
          await supabaseAdmin
            .from('inventory')
            .update({
              total_stock: newTotalStock,
              available_stock: newAvailableStock,
              storage_location: existingLog.storage_location,
              last_updated: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingInventory.id);
        }
      }
    }

    await createAuditLog(req.user.id, 'UPDATE', 'InboundLog', log.id, updateData, req);

    const formattedLog = {
      id: log.id,
      _id: log.id,
      clientId: log.clients ? {
        _id: log.clients.id,
        companyName: log.clients.company_name
      } : log.client_id,
      productId: log.products ? {
        _id: log.products.id,
        name: log.products.name,
        sku: log.products.sku
      } : log.product_id,
      quantity: log.quantity,
      referenceNumber: log.reference_number,
      storageLocation: log.storage_location,
      receivedDate: log.received_date,
      receivedBy: log.received_by,
      status: log.status,
      notes: log.notes,
      rejectedQuantity: log.rejected_quantity || 0,
      rejectionReason: log.rejection_reason,
      acceptedQuantity: log.accepted_quantity,
      createdAt: log.created_at,
      updatedAt: log.updated_at
    };

    res.status(200).json({
      success: true,
      message: 'Inbound log updated successfully',
      data: formattedLog
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inbound stats
 */
exports.getInboundStats = async (req, res, next) => {
  try {
    // Use admin client to bypass RLS
    let query = supabaseAdmin.from('inbound_logs').select('quantity, received_date');

    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    }

    const { data: logs, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch inbound stats'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalInbound = logs.reduce((sum, log) => sum + (log.quantity || 0), 0);
    const todayInbound = logs
      .filter(log => {
        const logDate = new Date(log.received_date);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === today.getTime();
      })
      .reduce((sum, log) => sum + (log.quantity || 0), 0);

    // Get recent logs - use admin client to bypass RLS
    const { data: recentLogs } = await supabaseAdmin
      .from('inbound_logs')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku
        )
      `)
      .order('received_date', { ascending: false })
      .limit(5);

    const formattedRecentLogs = (recentLogs || []).map(log => ({
      id: log.id,
      productId: log.products ? {
        name: log.products.name,
        sku: log.products.sku
      } : null,
      quantity: log.quantity,
      receivedDate: log.received_date
    }));

    res.status(200).json({
      success: true,
      data: {
        totalInbound,
        todayInbound,
        recentLogs: formattedRecentLogs
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete inbound log
 */
exports.deleteInboundLog = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if log exists - use admin client to bypass RLS
    const { data: inbound } = await supabaseAdmin
      .from('inbound_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (!inbound) {
      return res.status(404).json({
        success: false,
        message: 'Inbound entry not found'
      });
    }

    // Adjust inventory to remove the inbound quantity - use admin client to bypass RLS
    const { data: inventory } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('product_id', inbound.product_id)
      .eq('client_id', inbound.client_id)
      .single();

    if (inventory) {
      const newTotalStock = Math.max(0, inventory.total_stock - inbound.quantity);
      const newAvailableStock = Math.max(0, inventory.available_stock - inbound.quantity);

      await supabaseAdmin
        .from('inventory')
        .update({
          total_stock: newTotalStock,
          available_stock: newAvailableStock,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', inventory.id);
    }

    // Delete the inbound log - use admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('inbound_logs')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete inbound log'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'InboundLog', id, {
      referenceNumber: inbound.reference_number,
      productId: inbound.product_id,
      clientId: inbound.client_id,
      quantity: inbound.quantity
    }, req);

    res.status(200).json({
      success: true,
      message: 'Inbound entry deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
