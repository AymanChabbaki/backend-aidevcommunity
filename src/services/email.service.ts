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
  attachments?: { 
    filename?: string; 
    path?: string; 
    content?: any; 
    contentType?: string 
  }[];
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
      subEvents?: Array<{
        title: string;
        startAt: Date | string;
        endAt: Date | string;
        location?: string;
      }>;
    }
  ) => {
    const fe = eventDetails?.frontendUrl || process.env.FRONTEND_URL || 'https://aidevcommunity.vercel.app';
    const eventUrl = eventDetails?.eventId ? `${fe}/events/${eventDetails.eventId}` : `${fe}/events`;
    
    // Sort sub-events if they exist
    const subEvents = eventDetails?.subEvents ? [...eventDetails.subEvents].sort((a, b) => 
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    ) : [];

    const logoUrl = 'https://aidevcommunity.vercel.app/logo.png';

    return {
      subject: `✅ Registration Approved – ${eventTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; background-color: #f4f7fa; }
            .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7fa; padding-bottom: 40px; }
            .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #1a1a1a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
            .header { background: #09090b; padding: 40px 30px; text-align: center; }
            .logo { width: 160px; height: auto; margin-bottom: 20px; }
            .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
            .header p { color: rgba(255,255,255,0.7); margin: 8px 0 0; font-size: 16px; font-weight: 500; }
            .banner { width: 100%; display: block; border-bottom: 4px solid #3b82f6; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #000; }
            .intro { font-size: 16px; margin-bottom: 30px; color: #4b5563; }
            .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 30px; }
            .card h2 { margin: 0 0 20px; font-size: 18px; color: #111827; display: flex; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; }
            .detail-row { display: flex; margin-bottom: 12px; font-size: 14px; }
            .detail-label { font-weight: 700; color: #6b7280; width: 90px; flex-shrink: 0; }
            .detail-value { color: #111827; font-weight: 500; }
            
            .agenda-section { margin-top: 30px; }
            .agenda-section h3 { font-size: 18px; color: #111827; margin-bottom: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
            .agenda-item { background: #ffffff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 12px; border-radius: 0 8px 8px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.04); }
            .agenda-title { font-weight: 700; color: #111827; margin-bottom: 4px; display: block; }
            .agenda-time { font-size: 13px; color: #3b82f6; font-weight: 600; }
            .agenda-location { font-size: 12px; color: #6b7280; margin-top: 4px; display: block; }

            .badge-box { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px dashed #3b82f6; border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center; }
            .badge-box h3 { margin: 0 0 12px; font-size: 18px; color: #1e40af; }
            .badge-box p { font-size: 14px; color: #3b82f6; margin-bottom: 20px; }

            .btn-primary { display: inline-block; background-color: #3b82f6; color: #ffffff !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; transition: all 0.3s ease; }
            .btn-secondary { display: inline-block; background-color: #10b981; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; }
            .btn-outline { display: inline-block; border: 2px solid #3b82f6; color: #3b82f6 !important; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; margin-top: 10px; }

            .comment-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px; font-style: italic; color: #92400e; font-size: 14px; }
            .footer { padding: 40px; text-align: center; font-size: 12px; color: #6b7280; background: #f9fafb; }
            .social-links { margin-bottom: 16px; }
            .social-links a { color: #3b82f6; text-decoration: none; margin: 0 10px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <table class="main" align="center" width="100%">
              <tr>
                <td class="header">
                  <img src="${logoUrl}" alt="AI Dev Community" class="logo">
                  <h1>SECURE ENTRY GRANTED</h1>
                  <p>Registration Official Approved</p>
                </td>
              </tr>
              ${eventDetails?.imageUrl ? `<tr><td><img src="${eventDetails.imageUrl}" alt="${eventTitle}" class="banner" width="600"></td></tr>` : ''}
              <tr>
                <td class="content">
                  <p class="greeting">System Access: ${userName}</p>
                  <p class="intro">Confirmation successful. Your credentials for <strong>${eventTitle}</strong> have been verified and access is authorized. Synchronize your agenda for the following schedule:</p>

                  <div class="card">
                    <h2>📋 EVENT PROTOCOL</h2>
                    <div class="detail-row">
                      <span class="detail-label">EVENT:</span>
                      <span class="detail-value">${eventTitle}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">START:</span>
                      <span class="detail-value">${eventDate}</span>
                    </div>
                    ${eventDetails?.endDate ? `
                    <div class="detail-row">
                      <span class="detail-label">END:</span>
                      <span class="detail-value">${eventDetails.endDate}</span>
                    </div>` : ''}
                    ${eventDetails?.location ? `
                    <div class="detail-row">
                      <span class="detail-label">LOCATION:</span>
                      <span class="detail-value">${eventDetails.location}</span>
                    </div>` : ''}
                  </div>

                  ${comment ? `<div class="comment-box"><strong>MESSAGE FROM INTEL:</strong> "${comment}"</div>` : ''}

                  ${subEvents.length > 0 ? `
                  <div class="agenda-section">
                    <h3>📅 EVENT AGENDA (SESSION SYNC)</h3>
                    ${subEvents.map(se => `
                      <div class="agenda-item">
                        <span class="agenda-title">${se.title}</span>
                        <span class="agenda-time">⏱️ ${new Date(se.startAt).toLocaleDateString('en-GB')} ${new Date(se.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${new Date(se.endAt).toLocaleDateString('en-GB')} ${new Date(se.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        ${se.location ? `<span class="agenda-location">📍 ${se.location}</span>` : ''}
                      </div>
                    `).join('')}
                  </div>` : ''}

                  <div class="badge-box">
                    <h3>🎟️ ENTRY BADGE SECURED</h3>
                    <p>Your unique access token is ready for download in PDF format.</p>
                    <a href="${eventDetails?.badgeDownloadUrl || eventUrl}" class="btn-secondary">DOWNLOAD BADGE (PDF)</a>
                  </div>

                  <div style="text-align: center; margin-top: 40px;">
                    <a href="${eventUrl}" class="btn-primary">ACCESS EVENT PORTAL</a>
                    <br/>
                    <a href="${fe}/dashboard" class="btn-outline">VIEW DASHBOARD</a>
                  </div>

                  <p style="margin-top: 40px; font-size: 14px; color: #4b5563;">Best regards,<br/><strong style="color: #000;">AI Dev Community Global Command</strong></p>
                </td>
              </tr>
              <tr>
                <td class="footer">
                  <div class="social-links">
                    <a href="https://aidevcommunity.vercel.app">Official Website</a>
                    <a href="${fe}/contact">Support Core</a>
                  </div>
                  <p>© 2026 AI Dev Community. Pulse Network Synchronization Complete.</p>
                  <p>You are receiving this encrypted transmission because of your registered status.</p>
                </td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nYour registration for ${eventTitle} has been approved!\n\nEvent Details:\n- Event: ${eventTitle}\n- Start: ${eventDate}${eventDetails?.endDate ? '\n- End: ' + eventDetails.endDate : ''}${eventDetails?.location ? '\n- Location: ' + eventDetails.location : ''}\n\nAGENDA:\n${subEvents.map(se => `- ${se.title} (${new Date(se.startAt).toLocaleTimeString()} - ${new Date(se.endAt).toLocaleTimeString()}) @ ${se.location || 'Nexus Hall'}`).join('\n')}\n\nDownload your badge: ${eventDetails?.badgeDownloadUrl || eventUrl}\n\nBest regards,\nAI Dev Community Team`
    };
  },

  passwordReset: (userName: string, resetUrl: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
        .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #14b8a6, #0d9488); padding: 36px 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; }
        .header p { color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px; }
        .content { padding: 36px 32px; }
        .content p { color: #475569; margin: 0 0 16px; }
        .btn-wrap { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #14b8a6, #0d9488); color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
        .warning { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 24px 0; }
        .warning p { color: #92400e; margin: 0; font-size: 13px; }
        .url-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin: 16px 0; word-break: break-all; font-size: 12px; color: #64748b; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; }
        .footer p { color: #94a3b8; font-size: 12px; margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>🔐 Reset Your Password</h1>
          <p>AI Dev Community</p>
        </div>
        <div class="content">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>We received a request to reset the password for your account. Click the button below to choose a new password:</p>
          <div class="btn-wrap">
            <a href="${resetUrl}" class="btn">Reset My Password</a>
          </div>
          <div class="warning">
            <p>⏰ <strong>This link expires in 1 hour.</strong> If you don't reset your password within that time, you'll need to request a new link.</p>
          </div>
          <p>If the button above doesn't work, copy and paste this link into your browser:</p>
          <div class="url-box">${resetUrl}</div>
          <p>If you didn't request a password reset, you can safely ignore this email. Your password won't change unless you click the link above.</p>
          <p>Stay secure,<br><strong>AI Dev Community Team</strong></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AI Dev Community. All rights reserved.</p>
          <p>This is an automated message — please do not reply to this email.</p>
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

