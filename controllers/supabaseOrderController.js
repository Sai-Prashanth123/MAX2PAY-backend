const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Get all orders
 */
exports.getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, clientId, status, startDate, endDate } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Simplified query without joins (avoids schema/alias issues). Related data can be fetched separately when needed.
    // Use admin client to bypass RLS
    let query = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Filter by client
    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    // Filter by status (supports comma-separated values)
    if (status) {
      const statusArray = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statusArray.length === 1) {
        query = query.eq('status', statusArray[0]);
      } else if (statusArray.length > 1) {
        query = query.in('status', statusArray);
      }
    }

    // Date filters
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: orders, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch orders'
      });
    }

    // Fetch order items and client data for each order - use admin client to bypass RLS
    const ordersWithItems = await Promise.all((orders || []).map(async (order) => {
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select(`
          *,
          products:product_id (
            id,
            name,
            sku,
            category,
            description,
            image_url,
            reorder_level
          )
        `)
        .eq('order_id', order.id);

      // Fetch client data
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id, company_name, email, contact_person')
        .eq('id', order.client_id)
        .single();

      // Fetch inventory/stock location for each product
      const itemsWithStock = await Promise.all((items || []).map(async (item) => {
        let stockLocation = null;
        if (item.products?.id) {
          const { data: inventory } = await supabaseAdmin
            .from('inventory')
            .select('location, available_stock, reserved_stock')
            .eq('product_id', item.products.id)
            .eq('client_id', order.client_id)
            .maybeSingle();
          
          if (inventory) {
            stockLocation = {
              location: inventory.location || 'N/A',
              availableStock: parseInt(inventory.available_stock) || 0,
              reservedStock: parseInt(inventory.reserved_stock) || 0
            };
          }
        }

        return {
          productId: item.products ? {
            _id: item.products.id,
            id: item.products.id,
            name: item.products.name,
            sku: item.products.sku,
            category: item.products.category,
            description: item.products.description,
            imageUrl: item.products.image_url,
            reorderLevel: item.products.reorder_level
          } : item.product_id,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price || 0),
          stockLocation: stockLocation
        };
      }));

      return {
        id: order.id,
        _id: order.id,
        orderNumber: order.order_number,
        clientId: client ? {
          _id: client.id,
          id: client.id,
          companyName: client.company_name,
          email: client.email,
          contactPerson: client.contact_person
        } : order.client_id,
        createdBy: order.created_by,
        items: itemsWithStock,
        deliveryAddress: {
          name: order.delivery_address_name,
          phone: order.delivery_address_phone,
          street: order.delivery_address_street,
          city: order.delivery_address_city,
          state: order.delivery_address_state,
          zipCode: order.delivery_address_zip_code,
          country: order.delivery_address_country
        },
        status: order.status,
        priority: order.priority,
        notes: order.notes,
        approvedBy: order.approved_by,
        approvedAt: order.approved_at,
        packedAt: order.packed_at,
        dispatchedAt: order.dispatched_at,
        deliveredAt: order.delivered_at,
        trackingNumber: order.tracking_number,
        totalWeight: parseFloat(order.total_weight || 0),
        shippingFee: parseFloat(order.shipping_fee || 0),
        totalAmount: parseFloat(order.total_amount || 0),
        attachmentUrl: order.attachment_url || null,
        invoicedIn: order.invoiced_in || null,
        isLocked: !!order.invoiced_in,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      };
    }));

    res.status(200).json({
      success: true,
      data: ordersWithItems,
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
 * Get order by ID
 */
exports.getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use admin client to bypass RLS
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        clients:client_id (
          *
        ),
        user_profiles:created_by (
          id,
          name,
          email
        ),
        approved_user:approved_by (
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Fetch order items - use admin client to bypass RLS
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select(`
        *,
        products:product_id (
          *
        )
      `)
      .eq('order_id', id);

    const formattedOrder = {
      id: order.id,
      _id: order.id,
      orderNumber: order.order_number,
      clientId: order.clients || order.client_id,
      createdBy: order.user_profiles ? {
        _id: order.user_profiles.id,
        name: order.user_profiles.name,
        email: order.user_profiles.email
      } : order.created_by,
      approvedBy: order.approved_user ? {
        _id: order.approved_user.id,
        name: order.approved_user.name
      } : order.approved_by,
      items: (items || []).map(item => ({
        productId: item.products || item.product_id,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price || 0)
      })),
      deliveryAddress: {
        name: order.delivery_address_name,
        phone: order.delivery_address_phone,
        street: order.delivery_address_street,
        city: order.delivery_address_city,
        state: order.delivery_address_state,
        zipCode: order.delivery_address_zip_code,
        country: order.delivery_address_country
      },
      status: order.status,
      priority: order.priority,
      notes: order.notes,
      approvedAt: order.approved_at,
      packedAt: order.packed_at,
      dispatchedAt: order.dispatched_at,
      deliveredAt: order.delivered_at,
      trackingNumber: order.tracking_number,
      totalWeight: parseFloat(order.total_weight || 0),
      shippingFee: parseFloat(order.shipping_fee || 0),
      totalAmount: parseFloat(order.total_amount || 0),
      attachmentUrl: order.attachment_url || null,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    };

    res.status(200).json({
      success: true,
      data: formattedOrder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create order
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { clientId, items, deliveryAddress, notes, priority } = req.body;

    // Validate required fields
    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID is required'
      });
    }

    if (!items) {
      return res.status(400).json({
        success: false,
        message: 'Order items are required'
      });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Parse JSON strings from FormData
    let parsedItems;
    let parsedDeliveryAddress;
    
    try {
      parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
      parsedDeliveryAddress = typeof deliveryAddress === 'string' ? JSON.parse(deliveryAddress) : deliveryAddress;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format: ' + parseError.message
      });
    }

    // Validate items array
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required'
      });
    }

    // Calculate total weight and validate items
    let totalWeight = 0;
    
    for (const [index, item] of parsedItems.entries()) {
      if (!item.productId) {
        return res.status(400).json({
          success: false,
          message: `Product is required for item ${index + 1}`
        });
      }

      if (!item.quantity || item.quantity <= 0 || !Number.isInteger(Number(item.quantity))) {
        return res.status(400).json({
          success: false,
          message: `Quantity must be a positive whole number for item ${index + 1}`
        });
      }

      // Check inventory availability - use admin client to bypass RLS
      const { data: inventory } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('product_id', item.productId)
        .eq('client_id', clientId)
        .single();

      if (!inventory || inventory.available_stock < item.quantity) {
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('name')
          .eq('id', item.productId)
          .single();

        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product: ${product?.name || item.productId}`
        });
      }

      // Get product weight and calculate total - use admin client to bypass RLS
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('weight_value, weight_unit')
        .eq('id', item.productId)
        .single();

      if (product && product.weight_value) {
        let weightInLbs = product.weight_value;
        // Convert to lbs if needed
        if (product.weight_unit === 'kg') {
          weightInLbs = product.weight_value * 2.20462;
        } else if (product.weight_unit === 'g') {
          weightInLbs = product.weight_value * 0.00220462;
        }
        totalWeight += weightInLbs * item.quantity;
      }
    }

    // Calculate shipping fee based on weight
    const calculateShippingFee = (weight) => {
      if (weight <= 5) return 2.50;
      if (weight <= 10) return 5.00;
      if (weight <= 20) return 8.50;
      if (weight <= 50) return 15.00;
      return 25.00;
    };

    const shippingFee = calculateShippingFee(totalWeight);

    // Create order
    const orderData = {
      client_id: clientId,
      created_by: req.user.id,
      delivery_address_name: parsedDeliveryAddress.name,
      delivery_address_phone: parsedDeliveryAddress.phone,
      delivery_address_street: parsedDeliveryAddress.street,
      delivery_address_city: parsedDeliveryAddress.city,
      delivery_address_state: parsedDeliveryAddress.state,
      delivery_address_zip_code: parsedDeliveryAddress.zipCode,
      delivery_address_country: parsedDeliveryAddress.country || 'United States',
      status: 'pending',
      priority: priority || 'medium',
      notes: notes || null,
      total_weight: parseFloat(totalWeight.toFixed(2)),
      shipping_fee: shippingFee,
      total_amount: shippingFee // Will be updated when invoice is generated
    };

    // Add attachment_url if file is provided
    const attachmentPath = req.file ? `uploads/${req.file.filename}` : null;
    const orderDataWithAttachment = { ...orderData };
    if (attachmentPath) {
      orderDataWithAttachment.attachment_url = attachmentPath;
    }

    // Use admin client to bypass RLS
    // Create order first
    
    // Try to create order with attachment_url first
    let { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert(orderDataWithAttachment)
      .select()
      .single();

    // If error is about missing attachment_url column, retry without it
    if (orderError && orderError.message && (
      orderError.message.includes('attachment_url') || 
      (orderError.message.includes('column') && orderError.message.toLowerCase().includes('attachment')) ||
      orderError.message.includes('schema cache')
    )) {
      console.warn('[OrderController] attachment_url column not found, retrying order creation without attachment URL');
      
      // Try again without attachment_url
      const { data: orderRetry, error: retryError } = await supabaseAdmin
        .from('orders')
        .insert(orderData) // Without attachment_url
        .select()
        .single();
      
      if (retryError) {
        // Still failed with a different error
        return res.status(400).json({
          success: false,
          message: retryError.message || 'Failed to create order',
          details: retryError.details || null
        });
      }
      
      // Success without attachment - order created but PDF not saved
      order = orderRetry;
      console.warn('[OrderController] Order created successfully but PDF attachment was not saved (attachment_url column missing - migration recommended)');
      // Continue with order creation flow - order is created, just without PDF URL
    } else if (orderError) {
      return res.status(400).json({
        success: false,
        message: orderError.message || 'Failed to create order',
        details: orderError.details || null
      });
    }

    // Create order items and reserve inventory - use admin client to bypass RLS
    // Track all operations for rollback if any fail
    const orderItemsCreated = [];
    const inventoryUpdates = [];
    
    try {
      for (const item of parsedItems) {
        // Validate unit_price
        if (item.unitPrice !== undefined && (isNaN(item.unitPrice) || item.unitPrice < 0)) {
          throw new Error(`Invalid unit price for item: ${item.productId}`);
        }

      // Create order item
        const orderItemData = {
          order_id: order.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice || 0
        };
        
        const { data: orderItem, error: itemError } = await supabaseAdmin
          .from('order_items')
          .insert(orderItemData)
          .select()
          .single();
        
        if (itemError) {
          throw new Error(`Failed to create order item: ${itemError.message}`);
        }
        
        orderItemsCreated.push(orderItem);

      // Reserve inventory
        const { data: inventory, error: inventoryFetchError } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('product_id', item.productId)
        .eq('client_id', clientId)
        .single();

        if (inventoryFetchError || !inventory) {
          throw new Error(`Inventory not found for product: ${item.productId}`);
        }

        const newAvailableStock = inventory.available_stock - item.quantity;
        const newReservedStock = inventory.reserved_stock + item.quantity;

        // Validate stock levels
        if (newAvailableStock < 0) {
          throw new Error(`Insufficient stock for product: ${item.productId}. Available: ${inventory.available_stock}, Requested: ${item.quantity}`);
        }

        const { error: updateError } = await supabaseAdmin
          .from('inventory')
          .update({
            available_stock: newAvailableStock,
            reserved_stock: newReservedStock,
            last_updated: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', inventory.id);

        if (updateError) {
          throw new Error(`Failed to update inventory: ${updateError.message}`);
        }

        inventoryUpdates.push({ inventoryId: inventory.id, quantity: item.quantity });
      }
    } catch (error) {
      // Rollback: Delete order items and restore inventory
      // Delete order items
      if (orderItemsCreated.length > 0) {
        const orderItemIds = orderItemsCreated.map(item => item.id);
        await supabaseAdmin
          .from('order_items')
          .delete()
          .in('id', orderItemIds);
      }

      // Restore inventory
      for (const update of inventoryUpdates) {
        const { data: inventory } = await supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('id', update.inventoryId)
          .single();

        if (inventory) {
          await supabaseAdmin
            .from('inventory')
            .update({
              available_stock: inventory.available_stock + update.quantity,
              reserved_stock: inventory.reserved_stock - update.quantity,
              last_updated: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', update.inventoryId);
        }
      }

      // Delete the order
      await supabaseAdmin
        .from('orders')
        .delete()
        .eq('id', order.id);

      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create order items',
        details: 'Order creation rolled back due to item creation failure'
      });
    }

    await createAuditLog(
      req.user.id,
      'ORDER_CREATED',
      'Order',
      order.id,
      { orderNumber: order.order_number, items: parsedItems },
      req
    );

    // Fetch populated order for response - use admin client to bypass RLS
    const { data: populatedOrder } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        ),
        user_profiles:created_by (
          id,
          name,
          email
        )
      `)
      .eq('id', order.id)
      .single();

    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku
        )
      `)
      .eq('order_id', order.id);

    const formattedOrder = {
      id: populatedOrder.id,
      _id: populatedOrder.id,
      orderNumber: populatedOrder.order_number,
      clientId: populatedOrder.clients ? {
        _id: populatedOrder.clients.id,
        companyName: populatedOrder.clients.company_name
      } : populatedOrder.client_id,
      createdBy: populatedOrder.user_profiles ? {
        _id: populatedOrder.user_profiles.id,
        name: populatedOrder.user_profiles.name,
        email: populatedOrder.user_profiles.email
      } : populatedOrder.created_by,
      items: (orderItems || []).map(item => ({
        productId: item.products ? {
          _id: item.products.id,
          name: item.products.name,
          sku: item.products.sku
        } : item.product_id,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price || 0)
      })),
      deliveryAddress: {
        name: populatedOrder.delivery_address_name,
        phone: populatedOrder.delivery_address_phone,
        street: populatedOrder.delivery_address_street,
        city: populatedOrder.delivery_address_city,
        state: populatedOrder.delivery_address_state,
        zipCode: populatedOrder.delivery_address_zip_code,
        country: populatedOrder.delivery_address_country
      },
      status: populatedOrder.status,
      priority: populatedOrder.priority,
      notes: populatedOrder.notes,
      totalWeight: parseFloat(populatedOrder.total_weight || 0),
      shippingFee: parseFloat(populatedOrder.shipping_fee || 0),
      totalAmount: parseFloat(populatedOrder.total_amount || 0),
      attachmentUrl: populatedOrder.attachment_url || null,
      createdAt: populatedOrder.created_at,
      updatedAt: populatedOrder.updated_at
    };

    // Check if PDF was uploaded but not saved (column missing)
    const pdfWarning = req.file && !populatedOrder.attachment_url 
      ? ' Note: PDF file was uploaded but not saved to database. Please run migration: ALTER TABLE orders ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500);'
      : '';

    res.status(201).json({
      success: true,
      message: 'Order created successfully' + pdfWarning,
      data: formattedOrder,
      pdfWarning: req.file && !populatedOrder.attachment_url ? 'PDF uploaded but not saved - migration required' : null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order status
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber } = req.body;

    // Get order with items - use admin client to bypass RLS
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // VALIDATE STATUS TRANSITION (enforce state machine)
    const validTransitions = {
      'pending': ['approved', 'cancelled'],
      'approved': ['packed', 'dispatched', 'cancelled'],
      'packed': ['dispatched'],
      'dispatched': [], // Final state
      'cancelled': [] // Final state
    };

    const allowedStatuses = validTransitions[order.status] || [];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition: ${order.status} → ${status}. Allowed: ${allowedStatuses.join(', ') || 'none'}`,
        code: 'INVALID_STATUS_TRANSITION',
        data: {
          currentStatus: order.status,
          attemptedStatus: status,
          allowedStatuses
        }
      });
    }

    // CRITICAL: Check if order is locked by invoice
    if (order.invoice_id) {
      // Fetch invoice to check its status
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('invoice_number, status')
        .eq('id', order.invoice_id)
        .single();

      // Orders are locked when invoice status is sent/partial/paid
      // Draft invoices do NOT lock orders
      if (invoice && invoice.status !== 'draft') {
        // BLOCK ALL CHANGES including cancellation
        // Reason: Invoiced = billed service. Cannot be operationally cancelled.
        // Use credit notes for returns/refunds/adjustments.
        return res.status(403).json({
          success: false,
          message: `Order is locked by invoice ${invoice.invoice_number} (status: ${invoice.status}). Invoiced orders cannot be modified.`,
          code: 'ORDER_LOCKED_BY_INVOICE',
          data: {
            invoiceNumber: invoice.invoice_number,
            invoiceStatus: invoice.status,
            currentStatus: order.status,
            attemptedStatus: status,
            solution: 'Create a credit note for returns, refunds, or adjustments'
          },
          hint: 'Invoiced orders represent billed services and are immutable. Use the credit note workflow instead.'
        });
      }
      
      // If invoice is draft, allow changes
      console.log(`ℹ️  Order ${order.order_number} linked to draft invoice ${invoice?.invoice_number} - changes allowed`);
    }

    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', id);

    const oldStatus = order.status;
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'approved') {
      updateData.approved_by = req.user.id;
      updateData.approved_at = new Date().toISOString();
    }

    if (status === 'packed') {
      updateData.packed_at = new Date().toISOString();
    }

    if (status === 'dispatched') {
      updateData.dispatched_at = new Date().toISOString();
      if (trackingNumber) {
        updateData.tracking_number = trackingNumber;
      }

      // Update inventory: move from reserved to dispatched - use admin client to bypass RLS
      for (const item of orderItems) {
        const { data: inventory, error: inventoryError } = await supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('client_id', order.client_id)
          .single();

        if (inventoryError || !inventory) {
          console.error(`Failed to fetch inventory for product ${item.product_id}:`, inventoryError);
          continue; // Skip this item but continue with others
        }

          const newReservedStock = inventory.reserved_stock - item.quantity;
          const newDispatchedStock = inventory.dispatched_stock + item.quantity;

        // Validate stock levels
        if (newReservedStock < 0) {
          console.error(`Invalid reserved stock calculation for product ${item.product_id}`);
          continue;
        }

        const { error: updateError } = await supabaseAdmin
            .from('inventory')
            .update({
              reserved_stock: newReservedStock,
              dispatched_stock: newDispatchedStock,
              last_updated: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', inventory.id);

        if (updateError) {
          console.error(`Failed to update inventory for product ${item.product_id}:`, updateError);
          // Continue with other items
        }
      }

      await createAuditLog(
        req.user.id,
        'OUTBOUND_DISPATCH',
        'Order',
        order.id,
        { orderNumber: order.order_number, items: orderItems },
        req
      );

      // AUTOMATIC INVOICE GENERATION DISABLED
      // Invoices are now generated monthly only via admin action
      // This prevents individual order invoices from being created automatically
      
      /* DISABLED - Monthly invoices only
      const { data: existingInvoice } = await supabaseAdmin
        .from('invoices')
        .select('id')
        .eq('order_id', id)
        .single();
      
      if (!existingInvoice) {
        // Calculate total units for this order
        const totalUnits = orderItems.reduce((sum, item) => {
          return sum + (parseInt(item.quantity) || 0);
        }, 0);

        if (totalUnits > 0) {
          // Apply pricing formula: $2.50 + (number_of_units - 1) × $1.25
          const BASE_RATE = 2.50;
          const ADDITIONAL_UNIT_RATE = 1.25;
          const orderCharge = BASE_RATE + ((totalUnits - 1) * ADDITIONAL_UNIT_RATE);
          
          const subtotal = Number(orderCharge.toFixed(2));
          const taxRate = 0; // No tax as per requirements
          const taxAmount = 0;
          const totalAmount = subtotal;
          
          const invoiceNumber = `INV-${Date.now()}-${order.order_number.replace('ORD-', '')}`;
          
          // Create line item
          const lineItems = [{
            description: `Order Fulfillment - ${order.order_number} (${totalUnits} units)`,
            quantity: totalUnits,
            unitPrice: Number((orderCharge / totalUnits).toFixed(2)),
            amount: subtotal
          }];
          
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);
          
          await supabaseAdmin
            .from('invoices')
            .insert({
              invoice_number: invoiceNumber,
              client_id: order.client_id,
              order_id: order.id,
              type: 'outbound',
              line_items: lineItems,
              subtotal: subtotal,
              amount: subtotal,
              tax_amount: taxAmount,
              tax_rate: taxRate,
              total_amount: totalAmount,
              balance_due: totalAmount,
              due_date: dueDate.toISOString().split('T')[0],
              status: 'sent',
              uploaded_by: req.user.id,
              notes: `Auto-generated invoice for dispatched order ${order.order_number}. Formula: $2.50 + (${totalUnits} - 1) × $1.25 = $${orderCharge.toFixed(2)}`
            });

          await createAuditLog(
            req.user.id,
            'INVOICE_AUTO_GENERATED',
            'Invoice',
            order.id,
            { 
              orderNumber: order.order_number, 
              invoiceNumber,
              totalUnits,
              orderCharge: orderCharge.toFixed(2),
              formula: `$2.50 + (${totalUnits} - 1) × $1.25`
            },
            req
          );

          console.log(`[AUTO-INVOICE] Generated invoice ${invoiceNumber} for order ${order.order_number}: ${totalUnits} units = $${orderCharge.toFixed(2)}`);
        }
      }
      */ // END DISABLED automatic invoice generation
    }

    if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
      
      // Invoice is now auto-generated on 'dispatched' status
      // This section is kept for backward compatibility but won't create duplicate invoices
      // as the check for existing invoice is already done in the dispatched section
    }

    if (status === 'cancelled') {
      // Return reserved stock to available - use admin client to bypass RLS
      for (const item of orderItems) {
        const { data: inventory, error: inventoryError } = await supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('client_id', order.client_id)
          .single();
        
        if (inventoryError || !inventory) {
          console.error(`Failed to fetch inventory for product ${item.product_id}:`, inventoryError);
          continue; // Skip this item but continue with others
        }

          const newReservedStock = Math.max(0, inventory.reserved_stock - item.quantity);
          const newAvailableStock = inventory.available_stock + Math.min(item.quantity, inventory.reserved_stock);

        const { error: updateError } = await supabaseAdmin
            .from('inventory')
            .update({
              available_stock: newAvailableStock,
              reserved_stock: newReservedStock,
              last_updated: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', inventory.id);

        if (updateError) {
          console.error(`Failed to update inventory for product ${item.product_id}:`, updateError);
          // Continue with other items
        }
      }

      await createAuditLog(
        req.user.id,
        'ORDER_CANCELLED',
        'Order',
        order.id,
        { oldStatus },
        req
      );
    }

    // Update order - use admin client to bypass RLS
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        ),
        user_profiles:created_by (
          id,
          name,
          email
        )
      `)
      .single();

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to update order'
      });
    }

    // Fetch order items for response
    // Use admin client to bypass RLS
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku
        )
      `)
      .eq('order_id', id);

    const formattedOrder = {
      id: updatedOrder.id,
      _id: updatedOrder.id,
      orderNumber: updatedOrder.order_number,
      clientId: updatedOrder.clients ? {
        _id: updatedOrder.clients.id,
        companyName: updatedOrder.clients.company_name
      } : updatedOrder.client_id,
      createdBy: updatedOrder.user_profiles ? {
        _id: updatedOrder.user_profiles.id,
        name: updatedOrder.user_profiles.name,
        email: updatedOrder.user_profiles.email
      } : updatedOrder.created_by,
      items: (items || []).map(item => ({
        productId: item.products ? {
          _id: item.products.id,
          name: item.products.name,
          sku: item.products.sku
        } : item.product_id,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price || 0)
      })),
      deliveryAddress: {
        name: updatedOrder.delivery_address_name,
        phone: updatedOrder.delivery_address_phone,
        street: updatedOrder.delivery_address_street,
        city: updatedOrder.delivery_address_city,
        state: updatedOrder.delivery_address_state,
        zipCode: updatedOrder.delivery_address_zip_code,
        country: updatedOrder.delivery_address_country
      },
      status: updatedOrder.status,
      priority: updatedOrder.priority,
      notes: updatedOrder.notes,
      approvedAt: updatedOrder.approved_at,
      packedAt: updatedOrder.packed_at,
      dispatchedAt: updatedOrder.dispatched_at,
      deliveredAt: updatedOrder.delivered_at,
      trackingNumber: updatedOrder.tracking_number,
      totalWeight: parseFloat(updatedOrder.total_weight || 0),
      shippingFee: parseFloat(updatedOrder.shipping_fee || 0),
      totalAmount: parseFloat(updatedOrder.total_amount || 0),
      attachmentUrl: updatedOrder.attachment_url || null,
      createdAt: updatedOrder.created_at,
      updatedAt: updatedOrder.updated_at
    };

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: formattedOrder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order stats
 */
exports.getOrderStats = async (req, res, next) => {
  try {
    // Use admin client to bypass RLS
    let query = supabaseAdmin.from('orders').select('status, total_amount');

    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    }

    const { data: orders, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch order stats'
      });
    }

    const stats = {};
    let totalAmount = 0;

    (orders || []).forEach(order => {
      const status = order.status || 'unknown';
      if (!stats[status]) {
        stats[status] = { count: 0, totalAmount: 0 };
      }
      stats[status].count++;
      stats[status].totalAmount += parseFloat(order.total_amount || 0);
      totalAmount += parseFloat(order.total_amount || 0);
    });

    const byStatus = Object.entries(stats).map(([status, data]) => ({
      _id: status,
      status,
      count: data.count,
      totalAmount: data.totalAmount
    }));

    res.status(200).json({
      success: true,
      data: {
        totalOrders: orders?.length || 0,
        byStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order attachment (PDF)
 * Only allowed for clients with pending orders
 */
exports.updateOrderAttachment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const fs = require('fs');
    const path = require('path');

    // Get the order - use admin client to bypass RLS
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is the order owner (client)
    if (req.user.role === 'client' && order.client_id !== req.user.client_id) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own orders'
      });
    }

    // Check if order is still pending
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'You can only replace PDF for pending orders. This order has already been approved.'
      });
    }

    // Check if new attachment was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file uploaded'
      });
    }

    // Delete old attachment file if it exists
    if (order.attachment_url) {
      const oldFilePath = path.join(__dirname, '..', order.attachment_url);
      if (fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
        } catch (err) {
          console.error('Error deleting old attachment:', err);
        }
      }
    }

    // Update order with new attachment
    const newAttachmentPath = req.file.path.replace(/\\/g, '/').replace('backend/', '');
    
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        attachment_url: newAttachmentPath,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to update order attachment'
      });
    }

    await createAuditLog(
      req.user.id,
      'UPDATE_ATTACHMENT',
      'Order',
      id,
      { oldAttachment: order.attachment_url, newAttachment: newAttachmentPath },
      req
    );

    res.status(200).json({
      success: true,
      message: 'Order attachment updated successfully',
      data: {
        id: updatedOrder.id,
        attachmentUrl: updatedOrder.attachment_url
      }
    });
  } catch (error) {
    next(error);
  }
};
