import nodemailer from 'nodemailer';

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    // Skip email sending if credentials not configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('Email credentials not configured, skipping email send');
      return true;
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'AI Dev Community'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.to}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Email Templates
export const emailTemplates = {
  registrationApproved: (userName: string, eventTitle: string, eventDate: string, comment?: string) => {
    return {
      subject: `Registration Approved - ${eventTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .success-icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✅</div>
              <h1>Registration Approved!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>Great news! Your registration for <strong>${eventTitle}</strong> has been approved.</p>
              <p><strong>Event Date:</strong> ${eventDate}</p>
              ${comment ? `<p><strong>Message from organizer:</strong><br/>${comment}</p>` : ''}
              <p>We're excited to see you at the event!</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">View Your Events</a>
              <p>If you have any questions, feel free to contact us.</p>
              <p>Best regards,<br/>AI Dev Community Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nYour registration for ${eventTitle} has been approved.\n\nEvent Date: ${eventDate}\n${comment ? `\nMessage: ${comment}\n` : ''}\nWe're excited to see you at the event!\n\nBest regards,\nAI Dev Community Team`
    };
  },

  registrationRejected: (userName: string, eventTitle: string, reason?: string) => {
    return {
      subject: `Registration Update - ${eventTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .info-icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="info-icon">ℹ️</div>
              <h1>Registration Update</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>Thank you for your interest in <strong>${eventTitle}</strong>.</p>
              <p>Unfortunately, your registration could not be approved at this time.</p>
              ${reason ? `<p><strong>Reason:</strong><br/>${reason}</p>` : ''}
              <p>We encourage you to check out our other upcoming events that might be a better fit.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/events" class="button">Browse Events</a>
              <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
              <p>Best regards,<br/>AI Dev Community Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nThank you for your interest in ${eventTitle}.\n\nUnfortunately, your registration could not be approved at this time.\n${reason ? `\nReason: ${reason}\n` : ''}\nWe encourage you to check out our other upcoming events.\n\nBest regards,\nAI Dev Community Team`
    };
  }
};
