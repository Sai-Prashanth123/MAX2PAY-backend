const { Parser } = require('json2csv');
const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Get inventory report
 */
exports.getInventoryReport = async (req, res, next) => {
  try {
    const { clientId, format = 'json' } = req.query;

    // Use admin client to bypass RLS
    let query = supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku,
          category
        ),
        clients:client_id (
          id,
          company_name
        )
      `);

    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    const { data: inventory, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch inventory report'
      });
    }

    const formattedInventory = (inventory || []).map(item => ({
      id: item.id,
      clientId: item.clients ? {
        companyName: item.clients.company_name
      } : null,
      productId: item.products ? {
        name: item.products.name,
        sku: item.products.sku,
        category: item.products.category
      } : null,
      totalStock: item.total_stock,
      availableStock: item.available_stock,
      reservedStock: item.reserved_stock,
      dispatchedStock: item.dispatched_stock,
      storageLocation: item.storage_location
    }));

    if (format === 'csv') {
      const csvData = formattedInventory.map(item => ({
        Client: item.clientId?.companyName || '',
        'Product Name': item.productId?.name || '',
        SKU: item.productId?.sku || '',
        Category: item.productId?.category || '',
        'Total Stock': item.totalStock,
        'Available Stock': item.availableStock,
        'Reserved Stock': item.reservedStock,
        'Dispatched Stock': item.dispatchedStock,
        'Storage Location': item.storageLocation || ''
      }));

      const fields = [
        'Client', 'Product Name', 'SKU', 'Category',
        'Total Stock', 'Available Stock', 'Reserved Stock',
        'Dispatched Stock', 'Storage Location'
      ];

      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment('inventory-report.csv');
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: formattedInventory
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order report
 */
exports.getOrderReport = async (req, res, next) => {
  try {
    const { clientId, startDate, endDate, status, format = 'json' } = req.query;

    // Use admin client to bypass RLS
    let query = supabaseAdmin
      .from('orders')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        )
      `)
      .order('created_at', { ascending: false });

    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: orders, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch order report'
      });
    }

    // Fetch order items for each order - use admin client to bypass RLS
    const ordersWithItems = await Promise.all((orders || []).map(async (order) => {
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);

      return {
        ...order,
        items: items || []
      };
    }));

    if (format === 'csv') {
      const csvData = ordersWithItems.map(order => ({
        orderNumber: order.order_number,
        client: order.clients?.company_name || '',
        status: order.status,
        priority: order.priority,
        totalAmount: parseFloat(order.total_amount || 0),
        itemCount: order.items?.length || 0,
        createdAt: order.created_at,
        deliveryCity: order.delivery_address_city || '',
        deliveryState: order.delivery_address_state || ''
      }));

      const fields = [
        'orderNumber', 'client', 'status', 'priority',
        'totalAmount', 'itemCount', 'createdAt',
        'deliveryCity', 'deliveryState'
      ];

      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment('order-report.csv');
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: ordersWithItems
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get inbound report
 */
exports.getInboundReport = async (req, res, next) => {
  try {
    const { clientId, startDate, endDate, format = 'json' } = req.query;

    // Use admin client to bypass RLS
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
        ),
        user_profiles:received_by (
          id,
          name
        )
      `)
      .order('received_date', { ascending: false });

    if (req.user.role === 'client' && req.user.client_id) {
      query = query.eq('client_id', req.user.client_id);
    } else if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }

    if (startDate) {
      query = query.gte('received_date', startDate);
    }
    if (endDate) {
      query = query.lte('received_date', endDate);
    }

    const { data: inboundLogs, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch inbound report'
      });
    }

    if (format === 'csv') {
      const csvData = (inboundLogs || []).map(log => ({
        referenceNumber: log.reference_number,
        client: log.clients?.company_name || '',
        product: log.products?.name || '',
        sku: log.products?.sku || '',
        quantity: log.quantity,
        storageLocation: log.storage_location,
        receivedBy: log.user_profiles?.name || '',
        receivedDate: log.received_date,
        status: log.status
      }));

      const fields = [
        'referenceNumber', 'client', 'product', 'sku',
        'quantity', 'storageLocation', 'receivedBy',
        'receivedDate', 'status'
      ];

      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment('inbound-report.csv');
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: inboundLogs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get client report
 */
exports.getClientReport = async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Get client - use admin client to bypass RLS
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get product count - use admin client to bypass RLS
    const { count: productCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_active', true);

    // Get inventory stats - use admin client to bypass RLS
    const { data: inventoryData } = await supabaseAdmin
      .from('inventory')
      .select('total_stock, available_stock')
      .eq('client_id', clientId);

    const inventoryStats = (inventoryData || []).reduce((acc, item) => ({
      totalStock: acc.totalStock + (item.total_stock || 0),
      availableStock: acc.availableStock + (item.available_stock || 0)
    }), { totalStock: 0, availableStock: 0 });

    // Get orders by status - use admin client to bypass RLS
    const { data: ordersData } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('client_id', clientId);

    const ordersByStatus = {};
    (ordersData || []).forEach(order => {
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    });

    const orders = Object.entries(ordersByStatus).map(([status, count]) => ({
      _id: status,
      status,
      count
    }));

    // Get total inbound quantity - use admin client to bypass RLS
    const { data: inboundData } = await supabaseAdmin
      .from('inbound_logs')
      .select('quantity')
      .eq('client_id', clientId);

    const totalInbound = (inboundData || []).reduce((sum, log) => sum + (log.quantity || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        client,
        productCount: productCount || 0,
        inventory: inventoryStats,
        orders,
        totalInbound
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard stats
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const clientFilter = req.user.role === 'client' ? { client_id: req.user.client_id } : {};

    // Get total products - use admin client to bypass RLS
    let productsQuery = supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (req.user.role === 'client') {
      if (req.user.client_id) productsQuery = productsQuery.eq('client_id', req.user.client_id);
    }

    const { count: totalProducts } = await productsQuery;

    // Get inventory stats - use admin client to bypass RLS
    let inventoryQuery = supabaseAdmin
      .from('inventory')
      .select('total_stock, available_stock, reserved_stock, dispatched_stock');

    if (req.user.role === 'client') {
      if (req.user.client_id) inventoryQuery = inventoryQuery.eq('client_id', req.user.client_id);
    }

    const { data: inventoryData } = await inventoryQuery;

    const inventory = (inventoryData || []).reduce((acc, item) => ({
      totalStock: acc.totalStock + (item.total_stock || 0),
      availableStock: acc.availableStock + (item.available_stock || 0),
      reservedStock: acc.reservedStock + (item.reserved_stock || 0),
      dispatchedStock: acc.dispatchedStock + (item.dispatched_stock || 0)
    }), { totalStock: 0, availableStock: 0, reservedStock: 0, dispatchedStock: 0 });

    // Get recent orders - use admin client to bypass RLS
    let recentOrdersQuery = supabaseAdmin
      .from('orders')
      .select(`
        *,
        clients:client_id (
          id,
          company_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (req.user.role === 'client') {
      if (req.user.client_id) recentOrdersQuery = recentOrdersQuery.eq('client_id', req.user.client_id);
    }

    const { data: recentOrdersData } = await recentOrdersQuery;

    // Get order items for recent orders - use admin client to bypass RLS
    const recentOrders = await Promise.all((recentOrdersData || []).map(async (order) => {
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select(`
          *,
          products:product_id (
            id,
            name
          )
        `)
        .eq('order_id', order.id);

      return {
        id: order.id,
        _id: order.id,
        orderNumber: order.order_number,
        clientId: order.clients ? {
          _id: order.clients.id,
          id: order.clients.id,
          companyName: order.clients.company_name
        } : { id: order.client_id, companyName: 'Unknown Client' },
        status: order.status,
        priority: order.priority,
        totalAmount: parseFloat(order.total_amount || 0),
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        items: items || []
      };
    }));

    // Get orders by status - use admin client to bypass RLS
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select('status');

    if (req.user.role === 'client') {
      if (req.user.client_id) ordersQuery = ordersQuery.eq('client_id', req.user.client_id);
    }

    const { data: ordersData } = await ordersQuery;

    const ordersByStatus = {};
    (ordersData || []).forEach(order => {
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    });

    const orders = Object.entries(ordersByStatus).map(([status, count]) => ({
      _id: status,
      status,
      count
    }));

    // Get order trend based on dateRange parameter
    const dateRange = req.query.dateRange || '7d';
    const daysCount = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysCount);

    // Use admin client to bypass RLS
    let trendQuery = supabaseAdmin
      .from('orders')
      .select('created_at, total_amount')
      .gte('created_at', startDate.toISOString());

    if (req.user.role === 'client') {
      if (req.user.client_id) trendQuery = trendQuery.eq('client_id', req.user.client_id);
    }

    const { data: trendData } = await trendQuery;

    // Group by date and calculate revenue
    const orderTrend = {};
    (trendData || []).forEach(order => {
      const date = new Date(order.created_at).toISOString().split('T')[0];
      if (!orderTrend[date]) {
        orderTrend[date] = { orders: 0, revenue: 0 };
      }
      orderTrend[date].orders += 1;
      orderTrend[date].revenue += parseFloat(order.total_amount || 0);
    });

    const orderTrendArray = Object.entries(orderTrend).map(([date, data]) => ({
      date,
      orders: data.orders,
      revenue: data.revenue
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Get inventory by category - use admin client to bypass RLS
    let categoryQuery = supabaseAdmin
      .from('inventory')
      .select(`
        available_stock,
        reserved_stock,
        dispatched_stock,
        products:product_id (
          category
        )
      `);

    if (req.user.role === 'client') {
      if (req.user.client_id) categoryQuery = categoryQuery.eq('client_id', req.user.client_id);
    }

    const { data: categoryData } = await categoryQuery;

    const inventoryByCategory = {};
    (categoryData || []).forEach(item => {
      const category = item.products?.category || 'Uncategorized';
      if (!inventoryByCategory[category]) {
        inventoryByCategory[category] = { available: 0, reserved: 0, dispatched: 0 };
      }
      inventoryByCategory[category].available += item.available_stock || 0;
      inventoryByCategory[category].reserved += item.reserved_stock || 0;
      inventoryByCategory[category].dispatched += item.dispatched_stock || 0;
    });

    const inventoryByCategoryArray = Object.entries(inventoryByCategory).map(([name, data]) => ({
      name,
      ...data
    }));

    // Get total clients (admin only) - use admin client to bypass RLS
    let totalClients = 0;
    if (req.user.role === 'admin') {
      const { count } = await supabaseAdmin
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      totalClients = count || 0;
    }

    // Get low stock items - use admin client to bypass RLS
    let lowStockQuery = supabaseAdmin
      .from('inventory')
      .select(`
        *,
        products:product_id (
          id,
          name,
          sku,
          reorder_level
        ),
        clients:client_id (
          id,
          company_name
        )
      `)
      .lte('available_stock', 10);

    if (req.user.role === 'client') {
      if (req.user.client_id) lowStockQuery = lowStockQuery.eq('client_id', req.user.client_id);
    }

    const { data: lowStockData } = await lowStockQuery;

    const filteredLowStock = (lowStockData || []).filter(item => {
      const reorderPoint = item.products?.reorder_level || 10;
      return (item.available_stock || 0) <= reorderPoint && (item.available_stock || 0) >= 0;
    });

    res.status(200).json({
      success: true,
      data: {
        totalClients,
        totalProducts: totalProducts || 0,
        inventory,
        recentOrders,
        orders,
        orderTrend: orderTrendArray,
        inventoryByCategory: inventoryByCategoryArray,
        lowStockItems: filteredLowStock
      }
    });
  } catch (error) {
    next(error);
  }
};
