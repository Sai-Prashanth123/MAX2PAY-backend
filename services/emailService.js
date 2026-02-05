// Email service for sending notifications
// Note: This requires SMTP configuration in environment variables
// For production, configure SMTP settings or use a service like SendGrid, Mailgun, etc.

const nodemailer = require('nodemailer');

// Create transporter (configure via environment variables)
let transporter = null;

const initTransporter = () => {
  if (transporter) return transporter;

  // Only initialize if SMTP is configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    console.warn('SMTP not configured. Email functionality will be disabled.');
    console.warn('To enable emails, set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
  }

  return transporter;
};

/**
 * Send confirmation email to user after contact form submission
 */
const sendContactConfirmation = async (contactData) => {
  const emailTransporter = initTransporter();
  
  if (!emailTransporter) {
    console.log('Email service not configured. Skipping confirmation email.');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const { name, email } = contactData;
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@max2pay.com';

    const mailOptions = {
      from: `"MAX2PAY Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'We\'ve Received Your Message - MAX2PAY',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">MAX2PAY</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2 style="color: #1f2937; margin-top: 0;">Thank You, ${name}!</h2>
            <p style="color: #4b5563; line-height: 1.6;">
              We've received your message and our team will review it shortly.
            </p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1f2937; margin-top: 0;">What's Next?</h3>
              <ul style="color: #4b5563; line-height: 1.8;">
                <li>We'll review your message within 2 hours</li>
                <li>Our team will reach out within 24 hours</li>
                <li>Check your email for updates</li>
              </ul>
            </div>
            <p style="color: #4b5563; line-height: 1.6;">
              If you have any urgent questions, please contact us directly at 
              <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a>
            </p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Best regards,<br>
              The MAX2PAY Team
            </p>
          </div>
        </div>
      `,
    };

    await emailTransporter.sendMail(mailOptions);
    return { success: true, message: 'Confirmation email sent' };
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Send notification email to admin/support team
 */
const sendContactNotification = async (contactData) => {
  const emailTransporter = initTransporter();
  
  if (!emailTransporter) {
    console.log('Email service not configured. Skipping notification email.');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const { name, email, company, phone, subject, message } = contactData;
    const contactEmail = process.env.CONTACT_EMAIL || process.env.SUPPORT_EMAIL || 'support@max2pay.com';

    const mailOptions = {
      from: `"MAX2PAY System" <${process.env.SMTP_USER}>`,
      to: contactEmail,
      subject: `New Contact Form Submission: ${subject || 'No Subject'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">New Contact Form Submission</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="color: #1f2937; margin-top: 0;">Contact Information</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; color: #4b5563;">Name:</td>
                  <td style="padding: 8px; color: #1f2937;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; color: #4b5563;">Email:</td>
                  <td style="padding: 8px; color: #1f2937;"><a href="mailto:${email}">${email}</a></td>
                </tr>
                ${company ? `
                <tr>
                  <td style="padding: 8px; font-weight: bold; color: #4b5563;">Company:</td>
                  <td style="padding: 8px; color: #1f2937;">${company}</td>
                </tr>
                ` : ''}
                ${phone ? `
                <tr>
                  <td style="padding: 8px; font-weight: bold; color: #4b5563;">Phone:</td>
                  <td style="padding: 8px; color: #1f2937;"><a href="tel:${phone}">${phone}</a></td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px; font-weight: bold; color: #4b5563;">Subject:</td>
                  <td style="padding: 8px; color: #1f2937;">${subject || 'N/A'}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <h3 style="color: #1f2937; margin-top: 0;">Message</h3>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; color: #4b5563; line-height: 1.6;">
                ${message.replace(/\n/g, '<br>')}
              </div>
            </div>
            
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-top: 20px; border-radius: 4px;">
              <p style="color: #dc2626; font-weight: bold; margin: 0;">
                ⚠️ Action Required: Respond within 24 hours
              </p>
            </div>
          </div>
        </div>
      `,
    };

    await emailTransporter.sendMail(mailOptions);
    return { success: true, message: 'Notification email sent' };
  } catch (error) {
    console.error('Error sending notification email:', error);
    return { success: false, message: error.message };
  }
};

module.exports = {
  sendContactConfirmation,
  sendContactNotification,
};
