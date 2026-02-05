const supabase = require('../config/supabase');

/**
 * Create audit log entry in Supabase
 */
const createAuditLog = async (userId, action, entity, entityId, changes, req = null) => {
  try {
    const auditData = {
      user_id: userId,
      action,
      entity,
      entity_id: entityId || null,
      changes: changes ? (typeof changes === 'object' ? changes : { message: changes }) : null,
      ip_address: req?.ip || req?.connection?.remoteAddress || null,
      user_agent: req?.get('user-agent') || null,
      timestamp: new Date().toISOString()
    };

    const { error } = await supabase
      .from('audit_logs')
      .insert(auditData);

    if (error) {
      console.error('Failed to create audit log:', error);
    }
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

module.exports = { createAuditLog };
