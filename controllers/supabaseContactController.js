const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabaseAdmin');
const { sendContactConfirmation, sendContactNotification } = require('../services/emailService');

/**
 * Create contact submission
 */
exports.createContactSubmission = async (req, res, next) => {
  try {
    const { name, email, company, phone, subject, message } = req.body;

    const submissionData = {
      name,
      email,
      company: company || null,
      phone: phone || null,
      subject: subject || null,
      message,
      status: 'new'
    };

    // Use supabaseAdmin to bypass RLS for public contact submissions
    const { data: submission, error } = await supabaseAdmin
      .from('contact_submissions')
      .insert(submissionData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create contact submission'
      });
    }

    // Send emails asynchronously (don't block response)
    Promise.all([
      sendContactConfirmation(submissionData),
      sendContactNotification(submissionData)
    ]).catch(err => {
      console.error('Error sending emails:', err);
      // Don't fail the request if email fails
    });

    res.status(201).json({
      success: true,
      message: 'Contact submission received successfully',
      data: submission
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all contact submissions
 */
exports.getAllContactSubmissions = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Use supabaseAdmin for admin access to all submissions
    let query = supabaseAdmin
      .from('contact_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: submissions, error, count } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch contact submissions'
      });
    }

    res.status(200).json({
      success: true,
      data: submissions || [],
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
 * Get contact submission by ID
 */
exports.getContactSubmissionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use supabaseAdmin for admin access
    const { data: submission, error } = await supabaseAdmin
      .from('contact_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !submission) {
      return res.status(404).json({
        success: false,
        message: 'Contact submission not found'
      });
    }

    // Mark as read if it's new
    if (submission.status === 'new') {
      await supabaseAdmin
        .from('contact_submissions')
        .update({ status: 'read', updated_at: new Date().toISOString() })
        .eq('id', id);
      
      submission.status = 'read';
    }

    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update contact submission
 */
exports.updateContactSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) updateData.status = status;
    // Note: notes field doesn't exist in schema, but we'll handle it if added

    // Use supabaseAdmin for admin access
    const { data: submission, error } = await supabaseAdmin
      .from('contact_submissions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !submission) {
      return res.status(404).json({
        success: false,
        message: 'Contact submission not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact submission updated successfully',
      data: submission
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete contact submission
 */
exports.deleteContactSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use supabaseAdmin for admin access
    const { error } = await supabaseAdmin
      .from('contact_submissions')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(404).json({
        success: false,
        message: 'Contact submission not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact submission deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
