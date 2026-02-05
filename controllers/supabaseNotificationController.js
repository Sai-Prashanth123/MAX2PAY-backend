const supabase = require('../config/supabase');

/**
 * Get notifications
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (isRead !== undefined) {
      query = query.eq('is_read', isRead === 'true');
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch notifications'
      });
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    const formattedNotifications = (notifications || []).map(notif => ({
      id: notif.id,
      _id: notif.id,
      userId: notif.user_id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      priority: notif.priority,
      isRead: notif.is_read,
      link: notif.link,
      metadata: notif.metadata,
      createdAt: notif.created_at
    }));

    res.status(200).json({
      success: true,
      data: formattedNotifications,
      unreadCount: unreadCount || 0,
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
 * Mark notification as read
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: notification, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    const formattedNotification = {
      id: notification.id,
      _id: notification.id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      isRead: notification.is_read,
      link: notification.link,
      metadata: notification.metadata,
      createdAt: notification.created_at
    };

    res.status(200).json({
      success: true,
      data: formattedNotification
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update notifications'
      });
    }

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete notification
 */
exports.deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get notification stats
 */
exports.getNotificationStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const clientFilter = req.user.role === 'client' ? { client_id: req.user.client_id } : {};

    // Get pending orders count
    let pendingOrdersQuery = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (req.user.role === 'client' && req.user.client_id) {
      pendingOrdersQuery = pendingOrdersQuery.eq('client_id', req.user.client_id);
    }

    const { count: pendingOrders } = await pendingOrdersQuery;

    // Get low stock items
    let lowStockQuery = supabase
      .from('inventory')
      .select('*', { count: 'exact', head: true })
      .lte('available_stock', 10);

    if (req.user.role === 'client' && req.user.client_id) {
      lowStockQuery = lowStockQuery.eq('client_id', req.user.client_id);
    }

    const { count: lowStock } = await lowStockQuery;

    // Get overdue invoices
    const today = new Date().toISOString().split('T')[0];
    let overdueInvoicesQuery = supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .in('status', ['sent', 'overdue'])
      .lt('due_date', today);

    if (req.user.role === 'client' && req.user.client_id) {
      overdueInvoicesQuery = overdueInvoicesQuery.eq('client_id', req.user.client_id);
    }

    const { count: overdueInvoices } = await overdueInvoicesQuery;

    res.status(200).json({
      success: true,
      data: {
        pendingOrders: pendingOrders || 0,
        lowStock: lowStock || 0,
        overdueInvoices: overdueInvoices || 0,
        total: (pendingOrders || 0) + (lowStock || 0) + (overdueInvoices || 0)
      }
    });
  } catch (error) {
    next(error);
  }
};
