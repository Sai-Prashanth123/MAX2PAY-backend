const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');
const { isMissingTableError, missingTableResponse } = require('../utils/supabaseError');

/**
 * Get all products
 */
exports.getAllProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, clientId, category, isActive } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Get products with client data and inventory - use admin client to bypass RLS
    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        ),
        inventory (
          available_stock,
          total_stock,
          reserved_stock,
          dispatched_stock
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Filter by client
    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    // Filter by active status
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Filter by category
    if (category) {
      query = query.eq('category', category);
    }

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: products, error, count } = await query;

    if (error) {
      if (isMissingTableError(error)) {
        return res.status(503).json(missingTableResponse(error, ['products', 'clients']));
      }
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch products'
      });
    }

    // Format products with client data and inventory
    const formattedProducts = (products || []).map(product => {
      // Get inventory data (first item if array, or the object itself)
      const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
      console.log('Product inventory data:', { 
        productId: product.id, 
        sku: product.sku,
        inventoryRaw: product.inventory,
        inventoryParsed: inventory,
        quantity: inventory?.available_stock 
      });
      
      return {
        id: product.id,
        _id: product.id,
        clientId: product.clients ? {
          _id: product.clients.id,
          id: product.clients.id,
          companyName: product.clients.company_name
        } : { id: product.client_id, companyName: 'Unknown Client' },
        name: product.name,
        sku: product.sku,
        description: product.description,
        category: product.category,
        unit: product.unit,
        dimensions: {
          length: product.dimensions_length,
          width: product.dimensions_width,
          height: product.dimensions_height,
          unit: product.dimensions_unit
        },
        weight: {
          value: product.weight_value,
          unit: product.weight_unit
        },
        quantity: inventory?.available_stock || 0,
        totalStock: inventory?.total_stock || 0,
        reservedStock: inventory?.reserved_stock || 0,
        dispatchedStock: inventory?.dispatched_stock || 0,
        reorderLevel: product.reorder_level,
        isActive: product.is_active,
        imageUrl: product.image_url,
        createdAt: product.created_at,
        updatedAt: product.updated_at
      };
    });

    res.status(200).json({
      success: true,
      data: formattedProducts,
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
 * Get product by ID
 */
exports.getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use admin client to bypass RLS
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return res.status(503).json(missingTableResponse(error, ['products', 'clients']));
      }
    }
    if (error || !product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get inventory for this product - use admin client to bypass RLS
    const { data: inventory } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('product_id', id)
      .single();

    // Format response
    const formattedProduct = {
      id: product.id,
      _id: product.id,
      clientId: product.client_id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
      unit: product.unit,
      dimensions: {
        length: product.dimensions_length,
        width: product.dimensions_width,
        height: product.dimensions_height,
        unit: product.dimensions_unit
      },
      weight: {
        value: product.weight_value,
        unit: product.weight_unit
      },
      reorderLevel: product.reorder_level,
      isActive: product.is_active,
      imageUrl: product.image_url,
      clientId: product.clients ? {
        _id: product.clients.id,
        companyName: product.clients.company_name,
        email: product.clients.email
      } : null,
      inventory: inventory ? {
        id: inventory.id,
        totalStock: inventory.total_stock,
        availableStock: inventory.available_stock,
        reservedStock: inventory.reserved_stock,
        dispatchedStock: inventory.dispatched_stock,
        storageLocation: inventory.storage_location
      } : null,
      createdAt: product.created_at,
      updatedAt: product.updated_at
    };

    res.json({
      success: true,
      data: formattedProduct
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get products by client ID
 */
exports.getProductsByClient = async (req, res, next) => {
  try {
    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID is required'
      });
    }

    // Use admin client to bypass RLS
    // First check if client exists
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get all products for client (both active and inactive for debugging)
    const { data: allProducts, error: allProductsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('client_id', clientId)
      .order('name', { ascending: true });

    if (allProductsError) {
      console.error('Error fetching all products:', allProductsError);
      return res.status(400).json({
        success: false,
        message: allProductsError.message || 'Failed to fetch products'
      });
    }

    // Filter active products
    const activeProducts = (allProducts || []).filter(p => p.is_active === true);

    // Log for debugging
    console.log(`[getProductsByClient] Client: ${clientId}, Total products: ${allProducts?.length || 0}, Active: ${activeProducts.length}`);

    // Format response (simpler format for order creation)
    const formattedProducts = activeProducts.map(product => ({
      id: product.id,
      _id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      category: product.category,
      description: product.description,
      dimensions: {
        length: product.dimensions_length,
        width: product.dimensions_width,
        height: product.dimensions_height,
        unit: product.dimensions_unit
      },
      weight: {
        value: product.weight_value,
        unit: product.weight_unit
      },
      reorderLevel: product.reorder_level,
      imageUrl: product.image_url,
      isActive: product.is_active
    }));

    res.json({
      success: true,
      data: formattedProducts,
      meta: {
        total: allProducts?.length || 0,
        active: activeProducts.length,
        inactive: (allProducts?.length || 0) - activeProducts.length
      }
    });
  } catch (error) {
    console.error('Error in getProductsByClient:', error);
    next(error);
  }
};

/**
 * Create new product
 */
exports.createProduct = async (req, res, next) => {
  try {
    const {
      clientId,
      name,
      sku,
      description,
      category,
      unit,
      dimensions,
      weight,
      reorderLevel,
      isActive = true
    } = req.body;

    // Check if SKU already exists - use admin client to bypass RLS
    const { data: existingProduct } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('sku', sku.toUpperCase())
      .single();

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product with this SKU already exists'
      });
    }

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

    const productData = {
      client_id: clientId,
      name,
      sku: sku.toUpperCase(),
      description: description || null,
      category: category || null,
      unit: unit || 'pcs',
      dimensions_length: dimensions?.length || null,
      dimensions_width: dimensions?.width || null,
      dimensions_height: dimensions?.height || null,
      dimensions_unit: dimensions?.unit || 'cm',
      weight_value: weight?.value || null,
      weight_unit: weight?.unit || 'kg',
      reorder_level: reorderLevel || 0,
      is_active: isActive,
      image_url: req.file ? `/uploads/${req.file.filename}` : null
    };

    // Use admin client to bypass RLS
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create product'
      });
    }

    // Create inventory record for new product - use admin client to bypass RLS
    await supabaseAdmin
      .from('inventory')
      .insert({
        product_id: product.id,
        client_id: clientId,
        total_stock: 0,
        available_stock: 0,
        reserved_stock: 0,
        dispatched_stock: 0
      })
      .single();

    await createAuditLog(req.user.id, 'CREATE', 'Product', product.id, productData, req);

    // Format response
    const formattedProduct = {
      id: product.id,
      _id: product.id,
      clientId: product.client_id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
      unit: product.unit,
      dimensions: {
        length: product.dimensions_length,
        width: product.dimensions_width,
        height: product.dimensions_height,
        unit: product.dimensions_unit
      },
      weight: {
        value: product.weight_value,
        unit: product.weight_unit
      },
      reorderLevel: product.reorder_level,
      isActive: product.is_active,
      imageUrl: product.image_url,
      createdAt: product.created_at,
      updatedAt: product.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: formattedProduct
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update product
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      sku,
      description,
      category,
      unit,
      dimensions,
      weight,
      reorderLevel,
      isActive
    } = req.body;

    // Check if product exists - use admin client to bypass RLS
    const { data: existingProduct } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if SKU is being changed and if new SKU already exists - use admin client
    if (sku && sku.toUpperCase() !== existingProduct.sku) {
      const { data: skuExists } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('sku', sku.toUpperCase())
        .single();

      if (skuExists) {
        return res.status(400).json({
          success: false,
          message: 'Product with this SKU already exists'
        });
      }
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (sku !== undefined) updateData.sku = sku.toUpperCase();
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (unit !== undefined) updateData.unit = unit;
    if (dimensions?.length !== undefined) updateData.dimensions_length = dimensions.length;
    if (dimensions?.width !== undefined) updateData.dimensions_width = dimensions.width;
    if (dimensions?.height !== undefined) updateData.dimensions_height = dimensions.height;
    if (dimensions?.unit !== undefined) updateData.dimensions_unit = dimensions.unit;
    if (weight?.value !== undefined) updateData.weight_value = weight.value;
    if (weight?.unit !== undefined) updateData.weight_unit = weight.unit;
    if (reorderLevel !== undefined) updateData.reorder_level = reorderLevel;
    if (isActive !== undefined) updateData.is_active = isActive;
    if (req.file) updateData.image_url = `/uploads/${req.file.filename}`;

    // Use admin client to bypass RLS
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update product'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'Product', product.id, updateData, req);

    // Format response
    const formattedProduct = {
      id: product.id,
      _id: product.id,
      clientId: product.client_id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
      unit: product.unit,
      dimensions: {
        length: product.dimensions_length,
        width: product.dimensions_width,
        height: product.dimensions_height,
        unit: product.dimensions_unit
      },
      weight: {
        value: product.weight_value,
        unit: product.weight_unit
      },
      reorderLevel: product.reorder_level,
      isActive: product.is_active,
      imageUrl: product.image_url,
      createdAt: product.created_at,
      updatedAt: product.updated_at
    };

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: formattedProduct
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete product
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if product exists - use admin client to bypass RLS
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if product has inventory or orders - use admin client to bypass RLS
    const [inventoryResult, orderItemsResult] = await Promise.all([
      supabaseAdmin.from('inventory').select('id').eq('product_id', id).limit(1),
      supabaseAdmin.from('order_items').select('id').eq('product_id', id).limit(1)
    ]);

    if (inventoryResult.data?.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete product with existing inventory'
      });
    }

    if (orderItemsResult.data?.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete product with associated orders'
      });
    }

    // Use admin client to bypass RLS
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete product'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'Product', id, null, req);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
