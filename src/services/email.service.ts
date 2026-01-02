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

  passwordReset: (userName: string, resetUrl: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .button { display: inline-block; padding: 12px 30px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          <p>Best regards,<br>AI Dev Community Team</p>
        </div>
        <div class="footer">
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
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
  },

  newQuiz: (userName: string, quizTitle: string, quizDescription: string, startDate: string, endDate: string, customMessage?: string) => {
    return {
      subject: `New Quiz Available - ${quizTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="icon">🎯</div>
              <h1>New Quiz Available!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>A new quiz has been created and is available for you to participate:</p>
              <h2>${quizTitle}</h2>
              <p>${quizDescription}</p>
              <p><strong>Available from:</strong> ${startDate}</p>
              <p><strong>Until:</strong> ${endDate}</p>
              ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
              <p>Test your knowledge and compete for the top spot on the leaderboard!</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/quizzes" class="button" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">🎯 Take Quiz Now</a>
              </div>
              <p>Good luck!</p>
              <p>Best regards,<br/>AI Dev Community Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nA new quiz is available: ${quizTitle}\n\n${quizDescription}\n\nAvailable from: ${startDate}\nUntil: ${endDate}\n${customMessage ? `\n${customMessage}\n` : ''}\nVisit the platform to take the quiz!\n\nBest regards,\nAI Dev Community Team`
    };
  },

  newEvent: (userName: string, eventTitle: string, eventDescription: string, eventDate: string, customMessage?: string) => {
    return {
      subject: `New Event - ${eventTitle}`,
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
            .icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="icon">📅</div>
              <h1>New Event Announced!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>We're excited to announce a new event:</p>
              <h2>${eventTitle}</h2>
              <p>${eventDescription}</p>
              <p><strong>Event Date:</strong> ${eventDate}</p>
              ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
              <p>Don't miss out! Register now to secure your spot.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/events" class="button">View Event Details</a>
              <p>We look forward to seeing you there!</p>
              <p>Best regards,<br/>AI Dev Community Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nNew event: ${eventTitle}\n\n${eventDescription}\n\nEvent Date: ${eventDate}\n${customMessage ? `\n${customMessage}\n` : ''}\nRegister now on the platform!\n\nBest regards,\nAI Dev Community Team`
    };
  },

  newPoll: (userName: string, pollTitle: string, pollDescription: string, endDate: string, customMessage?: string) => {
    return {
      subject: `New Poll - ${pollTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="icon">📊</div>
              <h1>Your Opinion Matters!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>A new poll has been created and we'd love to hear your thoughts:</p>
              <h2>${pollTitle}</h2>
              <p>${pollDescription}</p>
              <p><strong>Vote before:</strong> ${endDate}</p>
              ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
              <p>Your vote helps us make better decisions for the community!</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/polls" class="button">Vote Now</a>
              <p>Thank you for your participation!</p>
              <p>Best regards,<br/>AI Dev Community Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nNew poll: ${pollTitle}\n\n${pollDescription}\n\nVote before: ${endDate}\n${customMessage ? `\n${customMessage}\n` : ''}\nVisit the platform to cast your vote!\n\nBest regards,\nAI Dev Community Team`
    };
  },

  newForm: (userName: string, formTitle: string, formDescription: string, customMessage?: string) => {
    return {
      subject: `New Form - ${formTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="icon">📝</div>
              <h1>New Form Available!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>A new form requires your attention:</p>
              <h2>${formTitle}</h2>
              <p>${formDescription}</p>
              ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
              <p>Please fill out the form at your earliest convenience.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">Fill Form</a>
              <p>Thank you for your time!</p>
              <p>Best regards,<br/>AI Dev Community Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nNew form: ${formTitle}\n\n${formDescription}\n${customMessage ? `\n${customMessage}\n` : ''}\nVisit the platform to fill out the form!\n\nBest regards,\nAI Dev Community Team`
    };
  }
};

