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
  attachments?: { filename?: string; path: string; contentType?: string }[];
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
      attachments: options.attachments,
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
  registrationApproved: (
    userName: string,
    eventTitle: string,
    eventDate: string,
    comment?: string,
    eventDetails?: {
      endDate?: string;
      location?: string;
      locationType?: string;
      category?: string;
      description?: string;
      imageUrl?: string;
      registrationId?: string;
      eventId?: string;
      badgeDownloadUrl?: string;
      frontendUrl?: string;
    }
  ) => {
    const fe = eventDetails?.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
    const eventUrl = eventDetails?.eventId ? `${fe}/events/${eventDetails.eventId}` : `${fe}/events`;
    return {
      subject: `✅ Registration Approved – ${eventTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; background: #f0f2f5; }
            .wrapper { background: #f0f2f5; padding: 30px 10px; }
            .container { max-width: 620px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 36px 30px 24px; text-align: center; }
            .header .success-icon { font-size: 52px; display: block; margin-bottom: 10px; }
            .header h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.5px; }
            .header p { margin: 0; opacity: 0.9; font-size: 15px; }
            .event-banner { width: 100%; max-height: 200px; object-fit: cover; display: block; }
            .content { background: #ffffff; padding: 30px; }
            .greeting { font-size: 16px; margin-bottom: 20px; }
            .details-card { background: #f8f6ff; border: 1px solid #e0d9ff; border-radius: 12px; padding: 20px 24px; margin: 20px 0; }
            .details-card h2 { margin: 0 0 16px; font-size: 18px; color: #5a47d6; border-bottom: 2px solid #e0d9ff; padding-bottom: 8px; }
            .detail-row { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; font-size: 14px; }
            .detail-icon { font-size: 16px; width: 22px; flex-shrink: 0; margin-top: 1px; }
            .detail-label { font-weight: 600; color: #4a4a6a; min-width: 90px; }
            .detail-value { color: #333; }
            .badge-cta { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #7dd3fc; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
            .badge-cta h3 { margin: 0 0 6px; font-size: 16px; color: #0369a1; }
            .badge-cta p { margin: 0 0 16px; font-size: 13px; color: #555; }
            .comment-box { background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 20px 0; font-size: 14px; }
            .comment-box strong { color: #92400e; }
            .button { display: inline-block; padding: 13px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 4px; }
            .button-green { display: inline-block; padding: 13px 32px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 4px; }
            .button-outline { display: inline-block; padding: 11px 28px; background: transparent; color: #667eea !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 2px solid #667eea; margin: 8px 4px; }
            .cta { text-align: center; margin: 24px 0 8px; }
            .footer { background: #f8f6ff; text-align: center; padding: 20px 30px; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="container">
              <div class="header">
                <span class="success-icon">🎉</span>
                <h1>You're In!</h1>
                <p>Registration Approved</p>
              </div>
              ${eventDetails?.imageUrl ? `<img src="${eventDetails.imageUrl}" alt="${eventTitle}" class="event-banner" />` : ''}
              <div class="content">
                <p class="greeting">Hi <strong>${userName}</strong>,</p>
                <p>Great news! Your registration for <strong>${eventTitle}</strong> has been approved. We can't wait to see you there!</p>

                <div class="details-card">
                  <h2>📋 Event Details</h2>
                  <div class="detail-row">
                    <span class="detail-icon">📌</span>
                    <span class="detail-label">Event</span>
                    <span class="detail-value"><strong>${eventTitle}</strong></span>
                  </div>
                  ${eventDetails?.category ? `
                  <div class="detail-row">
                    <span class="detail-icon">🏷️</span>
                    <span class="detail-label">Category</span>
                    <span class="detail-value">${eventDetails.category}</span>
                  </div>` : ''}
                  <div class="detail-row">
                    <span class="detail-icon">📅</span>
                    <span class="detail-label">Start</span>
                    <span class="detail-value">${eventDate}</span>
                  </div>
                  ${eventDetails?.endDate ? `
                  <div class="detail-row">
                    <span class="detail-icon">🏁</span>
                    <span class="detail-label">End</span>
                    <span class="detail-value">${eventDetails.endDate}</span>
                  </div>` : ''}
                  ${eventDetails?.location ? `
                  <div class="detail-row">
                    <span class="detail-icon">${eventDetails.locationType === 'ONLINE' ? '💻' : '📍'}</span>
                    <span class="detail-label">Location</span>
                    <span class="detail-value">${eventDetails.location}</span>
                  </div>` : ''}
                  ${eventDetails?.description ? `
                  <div class="detail-row">
                    <span class="detail-icon">📝</span>
                    <span class="detail-label">About</span>
                    <span class="detail-value">${eventDetails.description}</span>
                  </div>` : ''}
                </div>

                ${comment ? `<div class="comment-box"><strong>💬 Message from organizer:</strong><br/>${comment}</div>` : ''}

                <div class="badge-cta">
                  <h3>🪪 Your Entry Badge is Ready</h3>
                  <p>Click the button below to instantly download your badge PDF — no login required.</p>
                  <a href="${eventDetails?.badgeDownloadUrl || eventUrl}" class="button-green">⬇️ Download My Badge (PDF)</a>
                </div>

                <div class="cta">
                  <a href="${eventUrl}" class="button">View Event</a>
                  <a href="${fe}/dashboard" class="button-outline">My Dashboard</a>
                </div>

                <p style="font-size:13px; color:#888; margin-top:24px;">Have questions? Reply to this email or visit our <a href="${fe}/contact" style="color:#667eea;">contact page</a>.</p>
                <p style="font-size:14px;">Best regards,<br/><strong>AI Dev Community Team</strong></p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
                <p>You received this email because you registered for an event on AI Dev Community.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nYour registration for ${eventTitle} has been approved!\n\nEvent Details:\n- Event: ${eventTitle}\n- Start: ${eventDate}${eventDetails?.endDate ? '\n- End: ' + eventDetails.endDate : ''}${eventDetails?.location ? '\n- Location: ' + eventDetails.location : ''}${eventDetails?.category ? '\n- Category: ' + eventDetails.category : ''}${comment ? '\n\nMessage from organizer: ' + comment : ''}\n\nDownload your badge PDF directly: ${eventDetails?.badgeDownloadUrl || eventUrl}\n\nBest regards,\nAI Dev Community Team`
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

