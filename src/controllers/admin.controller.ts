import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role, search } = req.query;

  const where: any = {};

  if (role) {
    where.role = role;
  }

  if (search) {
    where.OR = [
      { displayName: { contains: search as string } },
      { email: { contains: search as string } }
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      staffRole: true,
      photoUrl: true,
      createdAt: true,
      _count: {
        select: {
          registrations: true,
          formResponses: true,
          votes: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: users
  });
});

export const updateUserRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role, staffRole } = req.body;

  if (!['USER', 'STAFF', 'ADMIN'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid role'
    });
  }

  const updateData: any = { role };
  
  // Only allow setting staffRole for STAFF users, clear it for others
  if (role === 'STAFF' && staffRole) {
    updateData.staffRole = staffRole;
  } else {
    updateData.staffRole = null;
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      staffRole: true
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'UPDATE_ROLE',
      entity: 'USER',
      entityId: id,
      metadata: { newRole: role, staffRole: staffRole || null }
    }
  });

  res.json({
    success: true,
    data: user
  });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete your own account'
    });
  }

  await prisma.user.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'DELETE',
      entity: 'USER',
      entityId: id
    }
  });

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

export const getStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [
    totalUsers,
    totalEvents,
    totalRegistrations,
    totalForms,
    totalPolls,
    recentUsers,
    upcomingEvents
  ] = await Promise.all([
    prisma.user.count(),
    prisma.event.count(),
    prisma.registration.count(),
    prisma.form.count(),
    prisma.poll.count(),
    prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    }),
    prisma.event.count({
      where: {
        startAt: { gte: new Date() },
        status: 'UPCOMING'
      }
    })
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalEvents,
      totalRegistrations,
      totalForms,
      totalPolls,
      recentUsers,
      upcomingEvents
    }
  });
});

export const getAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { limit = 50, entity } = req.query;

  const where: any = {};
  
  if (entity) {
    where.entity = entity;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      actor: {
        select: {
          displayName: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit)
  });

  res.json({
    success: true,
    data: logs
  });
});
