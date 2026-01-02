import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { sendEmail } from '../services/email.service';

// Get all users for selection
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      photoUrl: true,
    },
    orderBy: {
      displayName: 'asc',
    },
  });

  res.json({ success: true, data: users });
});

// Get events with registered users count
export const getEventsWithUsers = asyncHandler(async (req: Request, res: Response) => {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      title: true,
      startAt: true,
      _count: {
        select: {
          registrations: true,
        },
      },
    },
    orderBy: {
      startAt: 'desc',
    },
  });

  res.json({ success: true, data: events });
});

// Get users registered for a specific event
export const getEventUsers = asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params;

  const registrations = await prisma.registration.findMany({
    where: {
      eventId,
      status: {
        in: ['APPROVED', 'REGISTERED'],
      },
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  const users = registrations.map((reg) => reg.user);

  res.json({ success: true, data: users });
});

// Send email to selected users
export const sendMessageToUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { subject, message, recipientType, userIds, eventId } = req.body;
  const senderUser = req.user!;

  if (!subject || !message) {
    return res.status(400).json({
      success: false,
      error: 'Subject and message are required',
    });
  }

  let recipients: Array<{ email: string; displayName: string }> = [];

  // Get recipients based on type
  if (recipientType === 'all') {
    // Send to all users
    const users = await prisma.user.findMany({
      select: {
        email: true,
        displayName: true,
      },
    });
    recipients = users;
  } else if (recipientType === 'users') {
    // Send to users only (exclude staff and admin)
    const users = await prisma.user.findMany({
      where: {
        role: 'USER',
      },
      select: {
        email: true,
        displayName: true,
      },
    });
    recipients = users;
  } else if (recipientType === 'staff') {
    // Send to staff and admin only
    const users = await prisma.user.findMany({
      where: {
        role: {
          in: ['STAFF', 'ADMIN'],
        },
      },
      select: {
        email: true,
        displayName: true,
      },
    });
    recipients = users;
  } else if (recipientType === 'specific' && userIds && userIds.length > 0) {
    // Send to specific users
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        email: true,
        displayName: true,
      },
    });
    recipients = users;
  } else if (recipientType === 'event' && eventId) {
    // Send to event registrants
    const registrations = await prisma.registration.findMany({
      where: {
        eventId,
        status: {
          in: ['APPROVED', 'REGISTERED'],
        },
      },
      include: {
        user: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
    });
    recipients = registrations.map((reg) => reg.user);
  } else {
    return res.status(400).json({
      success: false,
      error: 'Invalid recipient configuration',
    });
  }

  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No recipients found',
    });
  }

  // Function to replace variables in message
  const replaceVariables = (text: string, recipient: { email: string; displayName: string }) => {
    return text
      .replace(/{{name}}/g, recipient.displayName)
      .replace(/{{email}}/g, recipient.email);
  };

  // Send emails to all recipients
  const emailPromises = recipients.map((recipient) => {
    const personalizedSubject = replaceVariables(subject, recipient);
    const personalizedMessage = replaceVariables(message, recipient);
    
    // Check if this is a quiz notification (contains "quiz" in subject)
    const isQuizNotification = subject.toLowerCase().includes('quiz');
    const isEventNotification = subject.toLowerCase().includes('event');
    const isPollNotification = subject.toLowerCase().includes('poll');
    const isFormNotification = subject.toLowerCase().includes('form');
    
    let buttonHtml = '';
    if (isQuizNotification) {
      buttonHtml = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/quizzes" 
             style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            🎯 Take Quiz Now
          </a>
        </div>
      `;
    } else if (isEventNotification) {
      buttonHtml = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/events" 
             style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            📅 View Event Details
          </a>
        </div>
      `;
    } else if (isPollNotification) {
      buttonHtml = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/polls" 
             style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            📊 Vote Now
          </a>
        </div>
      `;
    } else if (isFormNotification) {
      buttonHtml = `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" 
             style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            📝 Fill Form
          </a>
        </div>
      `;
    }
    
    return sendEmail({
      to: recipient.email,
      subject: personalizedSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Message from ${senderUser.role === 'ADMIN' ? 'Admin' : 'Staff'}</h2>
          <p>Hello ${recipient.displayName},</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            ${personalizedMessage.replace(/\n/g, '<br>')}
          </div>
          ${buttonHtml}
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This message was sent by ${senderUser.role === 'ADMIN' ? 'an administrator' : 'a staff member'} from AI Dev Community.
          </p>
        </div>
      `,
    });
  });

  try {
    await Promise.all(emailPromises);

    // Log the message sending activity
    await prisma.auditLog.create({
      data: {
        actorId: senderUser.id,
        action: 'SEND_MESSAGE',
        entity: 'MESSAGE',
        entityId: 'BULK_EMAIL',
        metadata: {
          subject,
          recipientType,
          recipientCount: recipients.length,
          ...(eventId && { eventId }),
        },
      },
    });

    res.json({
      success: true,
      message: `Email sent successfully to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send some emails. Please try again.',
    });
  }
});
