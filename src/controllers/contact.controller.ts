import { Response } from 'express';
import nodemailer from 'nodemailer';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendContactMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate input
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Save to database
    const contactMessage = await prisma.contactMessage.create({
      data: {
        name,
        email,
        subject,
        message,
        status: 'unread'
      }
    });

    // Email content for admin
    const adminMailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.CONTACT_EMAIL || process.env.SMTP_USER,
      subject: `Contact Form: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #14b8a6;">New Contact Form Message</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
          </div>
          <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border-left: 4px solid #14b8a6;">
            <h3 style="margin-top: 0;">Message:</h3>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
            <p style="color: #666; font-size: 12px;">
              This message was sent from the AI Dev Community contact form.
            </p>
          </div>
        </div>
      `,
    };

    // Auto-reply email for user
    const userMailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'We received your message - AI Dev Community',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0;">AI Dev Community</h1>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #14b8a6;">Thank you for contacting us, ${name}!</h2>
            <p style="color: #666; line-height: 1.6;">
              We've received your message and will get back to you as soon as possible.
            </p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Your Message:</h3>
              <p style="color: #666;"><strong>Subject:</strong> ${subject}</p>
              <p style="color: #666; white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #666; line-height: 1.6;">
              Our team typically responds within 24-48 hours during business days.
            </p>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                AI Dev Community | Building the Future Together
              </p>
            </div>
          </div>
        </div>
      `,
    };

    // Send emails
    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(userMailOptions);

    res.status(200).json({
      message: 'Message sent successfully',
      success: true,
      data: contactMessage
    });
  } catch (error: any) {
    console.error('Error sending contact message:', error);
    res.status(500).json({
      error: 'Failed to send message. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Get all contact messages (admin only)
export const getContactMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, page = '1', limit = '20' } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (status && status !== 'all') {
    where.status = status;
  }

  const [messages, total] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.contactMessage.count({ where })
  ]);

  res.json({
    success: true,
    data: messages,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  });
});

// Get single contact message (admin only)
export const getContactMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const message = await prisma.contactMessage.findUnique({
    where: { id }
  });

  if (!message) {
    return res.status(404).json({
      success: false,
      error: 'Message not found'
    });
  }

  res.json({
    success: true,
    data: message
  });
});

// Update contact message status (admin only)
export const updateContactMessageStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['unread', 'read', 'replied', 'archived'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status value'
    });
  }

  const message = await prisma.contactMessage.update({
    where: { id },
    data: {
      status,
      readAt: status === 'read' || status === 'replied' ? new Date() : undefined
    }
  });

  res.json({
    success: true,
    data: message
  });
});

// Delete contact message (admin only)
export const deleteContactMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.contactMessage.delete({
    where: { id }
  });

  res.json({
    success: true,
    message: 'Message deleted successfully'
  });
});

// Get contact statistics (admin only)
export const getContactStats = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [total, unread, read, replied, archived] = await Promise.all([
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { status: 'unread' } }),
    prisma.contactMessage.count({ where: { status: 'read' } }),
    prisma.contactMessage.count({ where: { status: 'replied' } }),
    prisma.contactMessage.count({ where: { status: 'archived' } })
  ]);

  res.json({
    success: true,
    data: {
      total,
      unread,
      read,
      replied,
      archived
    }
  });
});
