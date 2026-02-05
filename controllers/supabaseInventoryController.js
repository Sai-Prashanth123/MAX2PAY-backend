const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');
const { isMissingTableError, missingTableResponse } = require('../utils/supabaseError');

/**
 * Get all inventory items
 */
exports.getAllInventory = async (req, res, next) => {
  try {
    const { clientId, lowStock } = req.query;

    // Use admin client to bypass RLS - include product and client joins
    let query = supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku,
          category,
          unit,
          description,
          image_url
        ),
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .order('last_updated', { ascending: false });

    // Filter by client - handle both camelCase and snake_case
    const userClientId = req.user.client_id || req.user.clientId;
    console.log(`[Inventory] User role: ${req.user.role}, clientId: ${userClientId}, query clientId: ${clientId}`);
    
    if (req.user.role === 'client' && userClientId) {
      console.log(`[Inventory] Filtering by client_id: ${userClientId}`);
      query = query.eq('client_id', userClientId);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      // Only apply filter when clientId is a real UUID, not the string "null"/"undefined"
      console.log(`[Inventory] Filtering by query clientId: ${clientId}`);
      query = query.eq('client_id', clientId);
    } else {
      console.log(`[Inventory] No client filter applied (admin or no clientId)`);
    }

    const { data: inventory, error } = await query;

    if (error) {
      console.error('Inventory fetch error:', error);
      if (isMissingTableError(error)) {
        return res.status(503).json(missingTableResponse(error, ['inventory', 'products', 'clients']));
      }
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch inventory'
      });
    }

    // Log for debugging
    console.log(`[Inventory] Fetched ${inventory?.length || 0} inventory items for client: ${userClientId || 'all'}`);

    // Format response with product and client information
    let formattedInventory = (inventory || []).map(item => {
      // Handle case where joins might return null
      const product = item.products || null;
      const client = item.clients || null;
      
      return {
      id: item.id,
      _id: item.id,
      productId: product ? {
        _id: product.id,
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        unit: product.unit,
        description: product.description,
        imageUrl: product.image_url
      } : { id: item.product_id, name: 'Unknown Product', sku: 'N/A' },
      clientId: client ? {
        _id: client.id,
        id: client.id,
        companyName: client.company_name,
        email: client.email
      } : { id: item.client_id, companyName: 'Unknown Client' },
      totalStock: Number(item.total_stock) || 0,
      availableStock: Number(item.available_stock) || 0,
      reservedStock: Number(item.reserved_stock) || 0,
      dispatchedStock: Number(item.dispatched_stock) || 0,
      storageLocation: item.storage_location || '',
      lastUpdated: item.last_updated,
      createdAt: item.created_at,
      updatedAt: item.updated_at
      };
    });

    // Filter low stock items if requested (skip for now since we don't have product join)
    // TODO: Re-implement when product join is added back
    // if (lowStock === 'true') {
    //   formattedInventory = formattedInventory.filter(item => {
    //     if (item.productId && typeof item.productId === 'object' && item.productId.reorderLevel !== undefined) {
    //       return item.availableStock <= item.productId.reorderLevel;
    //     }
    //     return false;
    //   });
    // }

    res.json({
      success: true,
      count: formattedInventory.length,
      data: formattedInventory
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory by product ID
 */
exports.getInventoryByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Use admin client to bypass RLS
    const { data: inventory, error } = await supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku,
          unit,
          category,
          description,
          dimensions_length,
          dimensions_width,
          dimensions_height,
          dimensions_unit,
          weight_value,
          weight_unit,
          reorder_level,
          is_active,
          image_url
        ),
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .eq('product_id', productId)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return res.status(503).json(missingTableResponse(error, ['inventory', 'products', 'clients']));
      }
    }
    if (error || !inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory not found'
      });
    }

    // Format response
    const formattedInventory = {
      id: inventory.id,
      _id: inventory.id,
      productId: {
        _id: inventory.products?.id,
        id: inventory.products?.id,
        name: inventory.products?.name,
        sku: inventory.products?.sku,
        unit: inventory.products?.unit,
        category: inventory.products?.category,
        description: inventory.products?.description,
        dimensions: {
          length: inventory.products?.dimensions_length,
          width: inventory.products?.dimensions_width,
          height: inventory.products?.dimensions_height,
          unit: inventory.products?.dimensions_unit
        },
        weight: {
          value: inventory.products?.weight_value,
          unit: inventory.products?.weight_unit
        },
        reorderLevel: inventory.products?.reorder_level,
        isActive: inventory.products?.is_active,
        imageUrl: inventory.products?.image_url
      },
      clientId: {
        _id: inventory.clients?.id,
        companyName: inventory.clients?.company_name,
        email: inventory.clients?.email
      },
      totalStock: inventory.total_stock,
      availableStock: inventory.available_stock,
      reservedStock: inventory.reserved_stock,
      dispatchedStock: inventory.dispatched_stock,
      storageLocation: inventory.storage_location,
      lastUpdated: inventory.last_updated,
      createdAt: inventory.created_at,
      updatedAt: inventory.updated_at
    };

    res.json({
      success: true,
      data: formattedInventory
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjust inventory stock
 */
exports.adjustInventory = async (req, res, next) => {
  try {
    const { productId, adjustment, reason } = req.body;

    if (!productId || adjustment === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and adjustment are required'
      });
    }

    // Get current inventory - use admin client to bypass RLS
    const { data: inventory, error: fetchError } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('product_id', productId)
      .single();

    if (fetchError || !inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory not found'
      });
    }

    const oldAvailableStock = inventory.available_stock;
    const oldTotalStock = inventory.total_stock;

    // Calculate new values
    const newAvailableStock = oldAvailableStock + adjustment;
    const newTotalStock = oldTotalStock + adjustment;

    // Validate stock integrity
    if (newAvailableStock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for this adjustment'
      });
    }

    if (newTotalStock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Total stock cannot be negative'
      });
    }

    // Validate: available + reserved + dispatched should equal total
    const calculatedTotal = inventory.reserved_stock + inventory.dispatched_stock + newAvailableStock;
    if (Math.abs(calculatedTotal - newTotalStock) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Stock integrity validation failed. Please contact support.'
      });
    }

    // Update inventory - use admin client to bypass RLS
    const { data: updatedInventory, error: updateError } = await supabaseAdmin
      .from('inventory')
      .update({
        available_stock: newAvailableStock,
        total_stock: newTotalStock,
        last_updated: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', inventory.id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to update inventory'
      });
    }

    await createAuditLog(
      req.user.id,
      'INVENTORY_ADJUSTED',
      'Inventory',
      inventory.id,
      {
        oldStock: oldAvailableStock,
        newStock: newAvailableStock,
        adjustment,
        reason
      },
      req
    );

    // Format response
    const formattedInventory = {
      id: updatedInventory.id,
      _id: updatedInventory.id,
      productId: updatedInventory.product_id,
      clientId: updatedInventory.client_id,
      totalStock: updatedInventory.total_stock,
      availableStock: updatedInventory.available_stock,
      reservedStock: updatedInventory.reserved_stock,
      dispatchedStock: updatedInventory.dispatched_stock,
      storageLocation: updatedInventory.storage_location,
      lastUpdated: updatedInventory.last_updated,
      createdAt: updatedInventory.created_at,
      updatedAt: updatedInventory.updated_at
    };

    res.json({
      success: true,
      message: 'Inventory adjusted successfully',
      data: formattedInventory
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete inventory item
 */
exports.deleteInventory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if inventory exists - use admin client to bypass RLS
    const { data: inventory } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('id', id)
      .single();

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory not found'
      });
    }

    // Check if inventory has stock
    if (inventory.total_stock > 0 || inventory.reserved_stock > 0 || inventory.dispatched_stock > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete inventory with existing stock'
      });
    }

    // Use admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete inventory'
      });
    }

    await createAuditLog(
      req.user.id,
      'DELETE',
      'Inventory',
      id,
      {
        productId: inventory.product_id,
        clientId: inventory.client_id
      },
      req
    );

    res.json({
      success: true,
      message: 'Inventory deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inventory statistics
 */
exports.getInventoryStats = async (req, res, next) => {
  try {
    // Use admin client to bypass RLS
    let query = supabaseAdmin.from('inventory').select('*');

    // Filter by client if user is a client - handle both camelCase and snake_case
    const userClientId = req.user.client_id || req.user.clientId;
    if (req.user.role === 'client' && userClientId) {
      query = query.eq('client_id', userClientId);
    }

    const { data: allInventory, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch inventory stats'
      });
    }

    // Calculate statistics
    const stats = {
      totalProducts: new Set(allInventory.map(item => item.product_id)).size,
      totalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0
    };

    allInventory.forEach(item => {
      stats.totalStock += item.total_stock || 0;
      stats.availableStock += item.available_stock || 0;
      stats.reservedStock += item.reserved_stock || 0;
      stats.dispatchedStock += item.dispatched_stock || 0;
    });

    // Get low stock count - use admin client to bypass RLS
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, reorder_level');

    const productReorderLevels = {};
    products.forEach(product => {
      productReorderLevels[product.id] = product.reorder_level || 0;
    });

    let lowStockCount = 0;
    allInventory.forEach(item => {
      const reorderLevel = productReorderLevels[item.product_id] || 0;
      if (item.available_stock <= reorderLevel) {
        lowStockCount++;
      }
    });

    res.json({
      success: true,
      data: {
        ...stats,
        lowStockCount
      }
    });
  } catch (error) {
    next(error);
  }
};
