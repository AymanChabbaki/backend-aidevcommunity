import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

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
      bio: true,
      skills: true,
      studyLevel: true,
      studyProgram: true,
      github: true,
      linkedin: true,
      twitter: true,
      locale: true,
      publicProfile: true,
      createdAt: true,
      updatedAt: true,
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

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    email,
    displayName,
    role,
    staffRole,
    bio,
    studyLevel,
    studyProgram,
    publicProfile,
    github,
    linkedin,
    twitter,
    locale
  } = req.body;

  // Basic validation
  if (role && !['USER', 'STAFF', 'ADMIN'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid role'
    });
  }

  // Check if email is already taken by another user
  if (email) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: id }
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email is already in use by another account'
      });
    }
  }

  const updateData: any = {};
  if (email !== undefined) updateData.email = email;
  if (displayName !== undefined) updateData.displayName = displayName;
  if (role !== undefined) updateData.role = role;
  if (staffRole !== undefined) updateData.staffRole = staffRole;
  if (bio !== undefined) updateData.bio = bio;
  if (studyLevel !== undefined) updateData.studyLevel = studyLevel;
  if (studyProgram !== undefined) updateData.studyProgram = studyProgram;
  if (publicProfile !== undefined) updateData.publicProfile = publicProfile;
  if (github !== undefined) updateData.github = github;
  if (linkedin !== undefined) updateData.linkedin = linkedin;
  if (twitter !== undefined) updateData.twitter = twitter;
  if (locale !== undefined) updateData.locale = locale;

  // Special handling for staffRole: clear it if role is no longer STAFF
  if (role !== undefined && role !== 'STAFF') {
    updateData.staffRole = null;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      staffRole: true,
      bio: true,
      studyLevel: true,
      studyProgram: true,
      publicProfile: true,
      github: true,
      linkedin: true,
      twitter: true,
      locale: true
    }
  });

  // Log the comprehensive update
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'ADMIN_UPDATE_USER',
      entity: 'USER',
      entityId: id,
      metadata: { 
        updatedFields: Object.keys(updateData),
        changes: updateData 
      }
    }
  });

  res.json({
    success: true,
    data: updatedUser,
    message: 'User updated successfully'
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
