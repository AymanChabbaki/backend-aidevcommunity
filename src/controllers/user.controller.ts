import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      staffRole: true,
      photoUrl: true,
      bio: true,
      skills: true,
      github: true,
      linkedin: true,
      twitter: true,
      publicProfile: true,
      locale: true,
      studyLevel: true,
      studyProgram: true,
      createdAt: true,
      updatedAt: true
    }
  });

  res.json({
    success: true,
    data: user
  });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    displayName,
    staffRole,
    bio,
    skills,
    github,
    linkedin,
    twitter,
    publicProfile,
    locale,
    studyLevel,
    studyProgram
  } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      displayName,
      staffRole,
      bio,
      skills,
      github,
      linkedin,
      twitter,
      publicProfile,
      locale,
      studyLevel,
      studyProgram
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      staffRole: true,
      photoUrl: true,
      bio: true,
      skills: true,
      github: true,
      linkedin: true,
      twitter: true,
      publicProfile: true,
      locale: true,
      studyLevel: true,
      studyProgram: true
    }
  });

  res.json({
    success: true,
    data: user
  });
});

export const getPublicMembers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const members = await prisma.user.findMany({
    where: {
      publicProfile: true,
      role: {
        in: ['STAFF', 'ADMIN']
      }
    },
    select: {
      id: true,
      displayName: true,
      role: true,
      staffRole: true,
      photoUrl: true,
      bio: true,
      skills: true,
      github: true,
      linkedin: true,
      twitter: true,
      email: true,
      createdAt: true
    },
    orderBy: [
      { role: 'desc' }, // ADMIN first, then STAFF
      { createdAt: 'asc' }
    ]
  });

  res.json({
    success: true,
    data: members
  });
});

export const uploadProfilePhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  // Cloudinary stores the full URL in req.file.path
  const photoUrl = (req.file as any).path || `/uploads/${req.file.filename}`;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { photoUrl },
    select: {
      id: true,
      photoUrl: true
    }
  });

  res.json({
    success: true,
    data: user
  });
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 6 characters long'
    });
  }

  // Get user with password hash
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      passwordHash: true
    }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Current password is incorrect'
    });
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // Update password
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash: newPasswordHash }
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});
