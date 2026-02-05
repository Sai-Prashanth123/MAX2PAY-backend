const supabase = require('../config/supabase');
const { createAuditLog } = require('../middleware/supabaseAuditLog');

/**
 * Get all pricing
 */
exports.getAllPricing = async (req, res, next) => {
  try {
    const { clientId, warehouse, isActive } = req.query;

    let query = supabase
      .from('pricing')
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (clientId && clientId !== 'null' && clientId !== 'undefined') {
      query = query.eq('client_id', clientId);
    }
    if (warehouse) query = query.eq('warehouse', warehouse);
    if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');

    const { data: pricing, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch pricing'
      });
    }

    const formattedPricing = (pricing || []).map(item => ({
      id: item.id,
      _id: item.id,
      clientId: item.clients ? {
        _id: item.clients.id,
        companyName: item.clients.company_name,
        email: item.clients.email
      } : item.client_id,
      warehouse: item.warehouse,
      ratePerOrder: parseFloat(item.rate_per_order || 0),
      effectiveFrom: item.effective_from,
      effectiveTo: item.effective_to,
      isActive: item.is_active,
      notes: item.notes,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));

    res.status(200).json({
      success: true,
      data: formattedPricing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pricing by ID
 */
exports.getPricingById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: pricing, error } = await supabase
      .from('pricing')
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

    if (error || !pricing) {
      return res.status(404).json({
        success: false,
        message: 'Pricing not found'
      });
    }

    const formattedPricing = {
      id: pricing.id,
      _id: pricing.id,
      clientId: pricing.clients ? {
        _id: pricing.clients.id,
        companyName: pricing.clients.company_name,
        email: pricing.clients.email
      } : pricing.client_id,
      warehouse: pricing.warehouse,
      ratePerOrder: parseFloat(pricing.rate_per_order || 0),
      effectiveFrom: pricing.effective_from,
      effectiveTo: pricing.effective_to,
      isActive: pricing.is_active,
      notes: pricing.notes,
      createdAt: pricing.created_at,
      updatedAt: pricing.updated_at
    };

    res.status(200).json({
      success: true,
      data: formattedPricing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get client pricing
 */
exports.getClientPricing = async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { warehouse } = req.query;

    let query = supabase
      .from('pricing')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1);

    if (warehouse) {
      query = query.eq('warehouse', warehouse);
    }

    const { data: pricing } = await query;

    if (!pricing || pricing.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          ratePerOrder: 2.25,
          isDefault: true
        }
      });
    }

    const formattedPricing = {
      id: pricing[0].id,
      _id: pricing[0].id,
      clientId: pricing[0].client_id,
      warehouse: pricing[0].warehouse,
      ratePerOrder: parseFloat(pricing[0].rate_per_order || 0),
      effectiveFrom: pricing[0].effective_from,
      effectiveTo: pricing[0].effective_to,
      isActive: pricing[0].is_active,
      notes: pricing[0].notes,
      createdAt: pricing[0].created_at,
      updatedAt: pricing[0].updated_at
    };

    res.status(200).json({
      success: true,
      data: formattedPricing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create pricing
 */
exports.createPricing = async (req, res, next) => {
  try {
    const { clientId, warehouse, ratePerOrder, effectiveFrom, notes } = req.body;

    // Check if client exists
    const { data: client } = await supabase
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

    const pricingData = {
      client_id: clientId,
      warehouse: warehouse || 'Main Warehouse',
      rate_per_order: parseFloat(ratePerOrder),
      effective_from: effectiveFrom || new Date().toISOString().split('T')[0],
      notes: notes || null
    };

    const { data: pricing, error } = await supabase
      .from('pricing')
      .insert(pricingData)
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create pricing'
      });
    }

    await createAuditLog(req.user.id, 'CREATE', 'Pricing', pricing.id, pricingData, req);

    const formattedPricing = {
      id: pricing.id,
      _id: pricing.id,
      clientId: pricing.clients ? {
        _id: pricing.clients.id,
        companyName: pricing.clients.company_name,
        email: pricing.clients.email
      } : pricing.client_id,
      warehouse: pricing.warehouse,
      ratePerOrder: parseFloat(pricing.rate_per_order || 0),
      effectiveFrom: pricing.effective_from,
      effectiveTo: pricing.effective_to,
      isActive: pricing.is_active,
      notes: pricing.notes,
      createdAt: pricing.created_at,
      updatedAt: pricing.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'Pricing created successfully',
      data: formattedPricing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update pricing
 */
exports.updatePricing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ratePerOrder, effectiveTo, isActive, notes } = req.body;

    // Check if pricing exists
    const { data: existingPricing } = await supabase
      .from('pricing')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingPricing) {
      return res.status(404).json({
        success: false,
        message: 'Pricing not found'
      });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (ratePerOrder !== undefined) updateData.rate_per_order = parseFloat(ratePerOrder);
    if (effectiveTo !== undefined) updateData.effective_to = effectiveTo;
    if (isActive !== undefined) updateData.is_active = isActive;
    if (notes !== undefined) updateData.notes = notes;

    const { data: pricing, error } = await supabase
      .from('pricing')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          email
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update pricing'
      });
    }

    await createAuditLog(req.user.id, 'UPDATE', 'Pricing', pricing.id, updateData, req);

    const formattedPricing = {
      id: pricing.id,
      _id: pricing.id,
      clientId: pricing.clients ? {
        _id: pricing.clients.id,
        companyName: pricing.clients.company_name,
        email: pricing.clients.email
      } : pricing.client_id,
      warehouse: pricing.warehouse,
      ratePerOrder: parseFloat(pricing.rate_per_order || 0),
      effectiveFrom: pricing.effective_from,
      effectiveTo: pricing.effective_to,
      isActive: pricing.is_active,
      notes: pricing.notes,
      createdAt: pricing.created_at,
      updatedAt: pricing.updated_at
    };

    res.status(200).json({
      success: true,
      message: 'Pricing updated successfully',
      data: formattedPricing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete pricing
 */
exports.deletePricing = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if pricing exists
    const { data: pricing } = await supabase
      .from('pricing')
      .select('*')
      .eq('id', id)
      .single();

    if (!pricing) {
      return res.status(404).json({
        success: false,
        message: 'Pricing not found'
      });
    }

    const { error } = await supabase
      .from('pricing')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete pricing'
      });
    }

    await createAuditLog(req.user.id, 'DELETE', 'Pricing', id, null, req);

    res.status(200).json({
      success: true,
      message: 'Pricing deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
