import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

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
