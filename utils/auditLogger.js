const supabaseAdmin = require('../config/supabaseAdmin');

/**
 * Create an audit log entry
 * @param {string} userId - User who performed the action
 * @param {string} action - Action type (CREATE, UPDATE, DELETE, PAYMENT, etc.)
 * @param {string} entityType - Type of entity (Invoice, Order, Product, etc.)
 * @param {string} entityId - ID of the entity
 * @param {object} changes - Changes made or data
 * @param {object} req - Express request object (optional)
 */
exports.createAuditLog = async (userId, action, entityType, entityId, changes, req = null) => {
  try {
    const auditData = {
      user_id: userId,
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      changes: changes,
      ip_address: req?.ip || null,
      user_agent: req?.headers?.['user-agent'] || null,
      created_at: new Date().toISOString()
    };

    // Try to insert into audit_logs table if it exists
    // If table doesn't exist, just log to console
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert(auditData);

    if (error) {
      // Table might not exist, just log to console
      console.log('📝 Audit Log:', {
        user: userId,
        action: action,
        entity: `${entityType}:${entityId}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // Silently fail - audit logging shouldn't break the application
    console.error('Audit log error (non-critical):', error.message);
  }
};
