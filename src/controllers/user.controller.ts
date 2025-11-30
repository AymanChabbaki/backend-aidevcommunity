import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
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
      photoUrl: true,
      bio: true,
      skills: true,
      github: true,
      linkedin: true,
      twitter: true,
      publicProfile: true,
      locale: true,
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
    bio,
    skills,
    github,
    linkedin,
    twitter,
    publicProfile,
    locale
  } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      displayName,
      bio,
      skills,
      github,
      linkedin,
      twitter,
      publicProfile,
      locale
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      photoUrl: true,
      bio: true,
      skills: true,
      github: true,
      linkedin: true,
      twitter: true,
      publicProfile: true,
      locale: true
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
