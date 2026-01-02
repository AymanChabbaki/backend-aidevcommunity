import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { sendEmail, emailTemplates } from '../services/email.service';

export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: req.user!.id,
      readAt: null
    }
  });

  res.json({
    success: true,
    data: {
      notifications,
      unreadCount
    }
  });
});

export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const notification = await prisma.notification.findUnique({
    where: { id }
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found'
    });
  }

  if (notification.userId !== req.user!.id) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized'
    });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() }
  });

  res.json({
    success: true,
    data: updated
  });
});

export const markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: {
      userId: req.user!.id,
      readAt: null
    },
    data: { readAt: new Date() }
  });

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
});

export const sendBulkNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userIds, title, message, type, itemId, emailSubject, emailMessage } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'User IDs array is required'
    });
  }

  if (!title || !message) {
    return res.status(400).json({
      success: false,
      error: 'Title and message are required'
    });
  }

  // Create in-app notifications
  const notifications = await Promise.all(
    userIds.map(userId =>
      prisma.notification.create({
        data: {
          userId,
          title,
          content: message,
          type: type || 'GENERAL',
          itemId: itemId || null
        }
      })
    )
  );

  // Send emails if email details provided
  if (emailSubject && emailMessage) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { email: true, displayName: true }
    });

    await Promise.all(
      users.map(user =>
        sendEmail({
          to: user.email,
          subject: emailSubject,
          html: emailMessage,
          text: emailMessage.replace(/<[^>]*>/g, '') // Strip HTML for text version
        })
      )
    );
  }

  res.json({
    success: true,
    message: `Notifications sent to ${userIds.length} user(s)`,
    data: { count: notifications.length }
  });
});

export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      photoUrl: true
    },
    orderBy: {
      displayName: 'asc'
    }
  });

  res.json({
    success: true,
    data: users
  });
});
