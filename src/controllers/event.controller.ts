import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { RegistrationStatus } from '@prisma/client';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail, emailTemplates } from '../services/email.service';
import { format } from 'date-fns';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

export const getAllEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, category, search } = req.query;

  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (category) {
    where.category = category;
  }

  if (search) {
    where.OR = [
      { title: { contains: search as string } },
      { description: { contains: search as string } }
    ];
  }

  try {
    const events = await prisma.event.findMany({
      where,
      include: {
        organizer: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        },
        _count: {
          select: { registrations: true }
        }
      },
      orderBy: { startAt: 'asc' }
    });

    // Update event statuses based on dates (excluding CANCELLED)
    const now = new Date();
    const updates: Promise<any>[] = [];

    for (const event of events) {
      if (event.status === 'CANCELLED') continue;

      const startDate = new Date(event.startAt);
      const endDate = new Date(event.endAt);

      let newStatus = event.status;
      if (now < startDate) {
        newStatus = 'UPCOMING';
      } else if (now >= startDate && now < endDate) {
        newStatus = 'ONGOING';
      } else if (now >= endDate) {
        newStatus = 'COMPLETED';
      }

      if (newStatus !== event.status) {
        updates.push(
          prisma.event.update({
            where: { id: event.id },
            data: { status: newStatus }
          })
        );
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    // Refetch events after updates
    const updatedEvents = await prisma.event.findMany({
      where,
      include: {
        organizer: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        },
        _count: {
          select: { registrations: true }
        }
      },
      orderBy: { startAt: 'asc' }
    });

    res.json({
      success: true,
      data: updatedEvents
    });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events: ' + error.message
    });
  }
});

export const getEventById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      organizer: {
        select: {
          id: true,
          displayName: true,
          photoUrl: true,
          bio: true
        }
      },
      _count: {
        select: { registrations: true }
      }
    }
  });

  if (!event) {
    return res.status(404).json({
      success: false,
      error: 'Event not found'
    });
  }

  res.json({
    success: true,
    data: event
  });
});

export const createEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    title,
    description,
    locationType,
    locationText,
    startAt,
    endAt,
    capacity,
    imageUrl,
    tags,
    category,
    speaker,
    requiresApproval,
    allowGuestRegistration,
    eligibleLevels,
    eligiblePrograms,
    customFields,
    useCustomBadge
  } = req.body;

  const event = await prisma.event.create({
    data: {
      title,
      description,
      locationType,
      locationText,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      capacity,
      imageUrl,
      tags,
      category,
      speaker,
      organizerId: req.user!.id,
      requiresApproval: requiresApproval || false,
      allowGuestRegistration: allowGuestRegistration || false,
      eligibleLevels: eligibleLevels || [],
      eligiblePrograms: eligiblePrograms || [],
      customFields: customFields || [],
      useCustomBadge: useCustomBadge || false
    }
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'CREATE',
      entity: 'EVENT',
      entityId: event.id,
      metadata: { title: event.title }
    }
  });

  res.status(201).json({
    success: true,
    data: event
  });
});

export const registerForEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      _count: { select: { registrations: true } }
    }
  });

  if (!event) {
    return res.status(404).json({
      success: false,
      error: 'Event not found'
    });
  }

  // Check capacity
  if (event._count.registrations >= event.capacity) {
    return res.status(400).json({
      success: false,
      error: 'Event is at full capacity'
    });
  }

  // Check if already registered
  const existingRegistration = await prisma.registration.findUnique({
    where: {
      eventId_userId: {
        eventId: id,
        userId: req.user!.id
      }
    }
  });

  if (existingRegistration) {
    return res.status(400).json({
      success: false,
      error: 'Already registered for this event'
    });
  }

  // Get user info for eligibility check
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { studyLevel: true, studyProgram: true }
  });

  // Check eligibility if event has requirements
  let isEligible = true;
  if (event.requiresApproval) {
    const eligibleLevels = event.eligibleLevels as string[] | null;
    const eligiblePrograms = event.eligiblePrograms as string[] | null;
    
    // Check study level if specified
    if (eligibleLevels && eligibleLevels.length > 0) {
      if (!user?.studyLevel || !eligibleLevels.includes(user.studyLevel)) {
        isEligible = false;
      }
    }
    
    // Check study program if specified
    if (eligiblePrograms && eligiblePrograms.length > 0) {
      if (!user?.studyProgram) {
        isEligible = false;
      } else {
        // Check if user's program matches any eligible program
        // Handle both full format (MASTER_M2) and short format (M2)
        const userProgram = user.studyProgram;
        const userProgramMatches = eligiblePrograms.some(eligibleProg => {
          return userProgram === eligibleProg || 
                 userProgram.endsWith('_' + eligibleProg) ||
                 userProgram.includes(eligibleProg);
        });
        
        if (!userProgramMatches) {
          isEligible = false;
        }
      }
    }

    // Block registration if not eligible
    if (!isEligible) {
      return res.status(403).json({
        success: false,
        error: 'You are not eligible for this event. Please check the eligibility requirements.',
      });
    }
  }

  // Generate QR token
  const qrToken = uuidv4();
  const status = 'PENDING';
  const customFieldValues = req.body.customFieldValues || null;

  const registration = await prisma.registration.create({
    data: {
      eventId: id,
      userId: req.user!.id,
      qrToken,
      status,
      ...(customFieldValues ? { customFieldValues } : {})
    },
    include: {
      event: true,
      user: {
        select: {
          displayName: true,
          email: true,
          photoUrl: true,
          studyLevel: true,
          studyProgram: true
        }
      }
    }
  });

  // Create notification
  const notificationTitle = 'Event Registration Pending';
  const notificationContent = `Your registration for ${event.title} is pending approval by staff.`;

  await prisma.notification.create({
    data: {
      userId: req.user!.id,
      type: 'EVENT_CONFIRMATION',
      title: notificationTitle,
      content: notificationContent
    }
  });

  res.status(201).json({
    success: true,
    data: registration,
    message: 'Registration submitted — awaiting staff approval'
  });
});

export const checkIn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { qrToken } = req.body;

  const registration = await prisma.registration.findFirst({
    where: {
      eventId: id,
      qrToken
    },
    include: {
      user: {
        select: {
          displayName: true,
          email: true,
          photoUrl: true
        }
      }
    }
  });

  if (!registration) {
    return res.status(404).json({
      success: false,
      error: 'Registration not found'
    });
  }

  if (registration.checkedInAt) {
    return res.status(400).json({
      success: false,
      error: 'Already checked in',
      data: { checkedInAt: registration.checkedInAt }
    });
  }

  const updatedRegistration = await prisma.registration.update({
    where: { id: registration.id },
    data: { checkedInAt: new Date() }
  });

  res.json({
    success: true,
    data: updatedRegistration,
    message: `${registration.user.displayName} checked in successfully`
  });
});

export const checkInByToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing token' });
  }

  // Support both old badges (QR encodes registration.id) and new badges (QR encodes qrToken)
  const registration = await prisma.registration.findFirst({
    where: {
      OR: [
        { qrToken: token },
        { id: token }
      ]
    },
    include: {
      user: { select: { displayName: true, email: true, photoUrl: true } },
      event: { select: { title: true } }
    }
  });

  if (!registration) {
    return res.status(404).json({ success: false, error: 'Invalid QR code — registration not found' });
  }

  if (!['APPROVED', 'REGISTERED'].includes(registration.status)) {
    return res.status(403).json({ success: false, error: 'Registration is not approved' });
  }

  if (registration.checkedInAt) {
    return res.status(400).json({
      success: false,
      error: 'Already checked in',
      data: { checkedInAt: registration.checkedInAt, name: registration.user.displayName }
    });
  }

  await prisma.registration.update({
    where: { id: registration.id },
    data: { checkedInAt: new Date() }
  });

  res.json({
    success: true,
    message: `${registration.user.displayName} checked in successfully`,
    data: { name: registration.user.displayName, eventTitle: registration.event.title }
  });
});

export const getEventRegistrations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const registrations = await prisma.registration.findMany({
    where: { eventId: id },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          photoUrl: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: registrations
  });
});

export const exportRegistrations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const registrations = await prisma.registration.findMany({
    where: { eventId: id },
    include: {
      user: {
        select: {
          displayName: true,
          email: true
        }
      }
    }
  });

  // Create CSV
  const csvHeader = 'Name,Email,Status,Registered At,Checked In\n';
  const csvRows = registrations.map((reg: typeof registrations[0]) => 
    `${reg.user.displayName},${reg.user.email},${reg.status},${reg.createdAt},${reg.checkedInAt || 'Not checked in'}`
  ).join('\n');

  const csv = csvHeader + csvRows;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=registrations-${id}.csv`);
  res.send(csv);
});

export const updateEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    title,
    description,
    category,
    locationType,
    locationText,
    startAt,
    endAt,
    capacity,
    speaker,
    imageUrl,
    tags,
    requiresApproval,
    eligibleLevels,
    eligiblePrograms
  } = req.body;

  const event = await prisma.event.findUnique({ where: { id } });

  if (!event) {
    return res.status(404).json({
      success: false,
      error: 'Event not found'
    });
  }

  // Check if user is the organizer or admin
  if (event.organizerId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to update this event'
    });
  }

  // Build update data object with only provided fields
  const updateData: any = {};
  
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category;
  if (locationType !== undefined) updateData.locationType = locationType;
  if (locationText !== undefined) updateData.locationText = locationText;
  if (startAt !== undefined) updateData.startAt = new Date(startAt);
  if (endAt !== undefined) updateData.endAt = new Date(endAt);
  if (capacity !== undefined) updateData.capacity = capacity;
  if (speaker !== undefined) updateData.speaker = speaker;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (tags !== undefined) updateData.tags = tags;
  if (req.body.status !== undefined) updateData.status = req.body.status;
  if (requiresApproval !== undefined) updateData.requiresApproval = requiresApproval;
  if (req.body.allowGuestRegistration !== undefined) updateData.allowGuestRegistration = req.body.allowGuestRegistration;
  if (eligibleLevels !== undefined) updateData.eligibleLevels = eligibleLevels;
  if (eligiblePrograms !== undefined) updateData.eligiblePrograms = eligiblePrograms;
  if (req.body.customFields !== undefined) updateData.customFields = req.body.customFields;
  if (req.body.useCustomBadge !== undefined) updateData.useCustomBadge = req.body.useCustomBadge;

  const updatedEvent = await prisma.event.update({
    where: { id },
    data: updateData,
    include: {
      organizer: {
        select: {
          id: true,
          displayName: true,
          photoUrl: true
        }
      }
    }
  });

  res.json({
    success: true,
    data: updatedEvent
  });
});

export const deleteEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const event = await prisma.event.findUnique({ where: { id } });

  if (!event) {
    return res.status(404).json({
      success: false,
      error: 'Event not found'
    });
  }

  // Check if user is the organizer or admin
  if (event.organizerId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to delete this event'
    });
  }

  await prisma.event.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Event deleted successfully'
  });
});

export const getMyRegistrations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const registrations = await prisma.registration.findMany({
    where: { userId },
    include: {
      event: {
        include: {
          organizer: {
            select: {
              id: true,
              displayName: true,
              photoUrl: true
            }
          },
          _count: {
            select: { registrations: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: registrations
  });
});

export const getPendingRegistrations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, organizerId } = req.query;

  const whereClause: any = {};

  if (status !== 'ALL') {
    whereClause.status = ((status as string) || 'PENDING') as RegistrationStatus;
  }

  if (organizerId) {
    whereClause.event = { organizerId: organizerId as string };
  }

  const registrations = await prisma.registration.findMany({
    where: whereClause,
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
          requiresApproval: true,
          eligibleLevels: true,
          eligiblePrograms: true,
          organizerId: true,
          customFields: true   // ← field definitions so labels resolve
        }
      },
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          photoUrl: true,
          studyLevel: true,
          studyProgram: true,
          createdAt: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    data: registrations
  });
});

export const approveRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { comment } = req.body;

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      event: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    }
  });

  if (!registration) {
    return res.status(404).json({
      success: false,
      error: 'Registration not found'
    });
  }

  if (registration.status !== 'PENDING') {
    return res.status(400).json({
      success: false,
      error: 'Registration is not pending'
    });
  }

  // Update registration status
  const updatedRegistration = await prisma.registration.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      reviewComment: comment
    }
  });

  // Create notification for user
  await prisma.notification.create({
    data: {
      userId: registration.user.id,
      type: 'EVENT_CONFIRMATION',
      title: 'Registration Approved',
      content: `Your registration for ${registration.event.title} has been approved${comment ? ': ' + comment : ''}`
    }
  });

  // Send approval email with full event details + direct badge download link
  const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL?.replace(':5173', ':3000') || 'http://localhost:3000';
  const badgeDownloadUrl = `${backendUrl}/api/events/registrations/${registration.id}/badge?token=${registration.qrToken}`;

  const emailTemplate = emailTemplates.registrationApproved(
    registration.user.displayName,
    registration.event.title,
    format(new Date(registration.event.startAt), 'PPPp'),
    comment,
    {
      endDate: format(new Date(registration.event.endAt), 'PPPp'),
      location: (registration.event as any).locationText || undefined,
      locationType: (registration.event as any).locationType || 'PHYSICAL',
      category: (registration.event as any).category || undefined,
      description: registration.event.description || undefined,
      imageUrl: (registration.event as any).imageUrl || undefined,
      registrationId: registration.id,
      eventId: registration.eventId,
      badgeDownloadUrl,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    }
  );

  // Generate and attach badge PDF
  let attachments = undefined;
  try {
    const pdfBuffer = await generateBadgePDF(registration.id, registration.qrToken);
    const safeName = registration.event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    attachments = [{
      filename: `badge-${safeName}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }];
  } catch (err) {
    console.error('Failed to generate badge for email attachment:', err);
  }

  await sendEmail({
    to: registration.user.email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    text: emailTemplate.text,
    attachments
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'APPROVE_REGISTRATION',
      entity: 'REGISTRATION',
      entityId: id,
      metadata: {
        eventId: registration.eventId,
        userId: registration.userId,
        eventTitle: registration.event.title
      }
    }
  });

  res.json({
    success: true,
    data: updatedRegistration,
    message: 'Registration approved successfully'
  });
});

export const rejectRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      event: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    }
  });

  if (!registration) {
    return res.status(404).json({
      success: false,
      error: 'Registration not found'
    });
  }

  if (registration.status !== 'PENDING') {
    return res.status(400).json({
      success: false,
      error: 'Registration is not pending'
    });
  }

  // Update registration status
  const updatedRegistration = await prisma.registration.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      reviewComment: reason
    }
  });

  // Create notification for user
  await prisma.notification.create({
    data: {
      userId: registration.user.id,
      type: 'EVENT_UPDATE',
      title: 'Registration Not Approved',
      content: `Your registration for ${registration.event.title} was not approved${reason ? ': ' + reason : ''}`
    }
  });

  // Send rejection email
  const emailTemplate = emailTemplates.registrationRejected(
    registration.user.displayName,
    registration.event.title,
    reason
  );
  await sendEmail({
    to: registration.user.email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    text: emailTemplate.text
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'REJECT_REGISTRATION',
      entity: 'REGISTRATION',
      entityId: id,
      metadata: {
        eventId: registration.eventId,
        userId: registration.userId,
        eventTitle: registration.event.title,
        reason
      }
    }
  });

  res.json({
    success: true,
    data: updatedRegistration,
    message: 'Registration rejected'
  });
});

export const deleteRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      event: true,
      user: { select: { id: true, displayName: true, email: true } }
    }
  });

  if (!registration) {
    return res.status(404).json({ success: false, error: 'Registration not found' });
  }

  await prisma.registration.delete({ where: { id } });

  // Notify the user
  await prisma.notification.create({
    data: {
      userId: registration.user.id,
      type: 'EVENT_UPDATE',
      title: 'Registration Removed',
      content: `Your registration for ${registration.event.title} has been removed by staff.`
    }
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      action: 'DELETE_REGISTRATION',
      entity: 'REGISTRATION',
      entityId: id,
      metadata: {
        eventId: registration.eventId,
        userId: registration.userId,
        eventTitle: registration.event.title
      }
    }
  });

  res.json({ success: true, message: 'Registration deleted' });
});

export const downloadBadge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { token } = req.query as { token?: string };

  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing token' });
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      event: true
    }
  });

  if (!registration || registration.qrToken !== token) {
    return res.status(404).json({ success: false, error: 'Badge not found or invalid token' });
  }

  if (!['APPROVED', 'REGISTERED'].includes(registration.status)) {
    return res.status(403).json({ success: false, error: 'Badge only available for approved registrations' });
  }

  try {
    const pdfBuffer = await generateBadgePDF(registration.id, registration.qrToken);
    const safeName = registration.event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="badge-${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error in downloadBadge:', error);
    res.status(500).json({ success: false, error: 'Failed to generate badge: ' + error.message });
  }
});

/**
 * Reusable helper to generate the badge PDF (Standard or Custom Template)
 */
let badgeTemplateCache: Buffer | null = null;

async function getBadgeTemplate(): Promise<Buffer | null> {
  if (badgeTemplateCache) return badgeTemplateCache;
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://aidevcommunity.vercel.app';
  const templateUrl = `${frontendUrl}/badge.png`;
  
  try {
    const response = await axios.get(templateUrl, { responseType: 'arraybuffer' });
    badgeTemplateCache = Buffer.from(response.data);
    return badgeTemplateCache;
  } catch (err) {
    console.error('Failed to fetch badge template from frontend URL:', templateUrl);
    return null;
  }
}

async function generateBadgePDF(registrationId: string, token: string): Promise<Buffer> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      event: true,
      user: { select: { id: true, displayName: true, email: true } }
    }
  });

  if (!registration) throw new Error('Registration not found');

  const ev = registration.event as any;
  const qrBuffer = await QRCode.toBuffer(token, { width: 180, margin: 1 });
  
  // Create PDF (A4 is 595.28 x 841.89 points)
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  return new Promise<Buffer>(async (resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = 595.28;
    const pageH = 841.89;
    const mmToPt = 595.28 / 210; // ~2.8346

    // ─── A: Custom Badge Path (High Fidelity Mirror) ──────────────────────
    if (ev.useCustomBadge) {
      const templateBuffer = await getBadgeTemplate();
      if (templateBuffer) {
        doc.image(templateBuffer, 0, 0, { width: pageW, height: pageH });
      }

      // 1. Event Title
      // Box: 7mm x 51.3mm (143.7w x 28h)
      // Conversion: Box(19.8x, 145.4y, 407.3w, 79.4h)
      const titleBox = { x: 7 * mmToPt, y: 51.3 * mmToPt, w: 143.7 * mmToPt, h: 28 * mmToPt };
      const eventTitle = (ev.titleAr || ev.titleFr || ev.title || '').toUpperCase();
      
      // Start at 31 pt
      let titleSize = 31;
      doc.font('Helvetica-Bold').fontSize(titleSize).fillColor('#FFFFFF');
      
      // Shrink logic
      while (doc.widthOfString(eventTitle) > titleBox.w * 0.95 && titleSize > 10) {
        titleSize -= 1;
        doc.fontSize(titleSize);
      }
      
      doc.text(eventTitle, titleBox.x, titleBox.y + (titleBox.h - titleSize * 1.2) / 2, {
        width: titleBox.w,
        align: 'center'
      });

      // 2. Attendee Name
      // Box: 75.2mm x 115.8mm (94.5w x 12.2h)
      const nameBox = { x: 75.2 * mmToPt, y: 115.8 * mmToPt, w: 94.5 * mmToPt, h: 12.2 * mmToPt };
      const attendeeName = (registration.user.displayName || registration.user.email).toUpperCase();
      let nameSize = 16;
      doc.font('Helvetica-Bold').fontSize(nameSize).fillColor('#1e293b');
      while (doc.widthOfString(attendeeName) > nameBox.w * 0.95 && nameSize > 8) {
        nameSize -= 1;
        doc.fontSize(nameSize);
      }
      doc.text(attendeeName, nameBox.x, nameBox.y + (nameBox.h - nameSize * 1.2) / 2, {
        width: nameBox.w,
        align: 'center'
      });

      // 3. QR Code
      // Box: 8.9mm x 154.4mm (84w x 84h)
      const qrBox = { x: 8.9 * mmToPt, y: 154.4 * mmToPt, w: 84 * mmToPt, h: 84 * mmToPt };
      // White backing for QR (optional, mimics frontend board)
      doc.roundedRect(qrBox.x - 2, qrBox.y - 2, qrBox.w + 4, qrBox.h + 4, 4).fill('#FFFFFF');
      doc.image(qrBuffer, qrBox.x, qrBox.y, { width: qrBox.w, height: qrBox.h });

      // 4. Date
      // Box: 18.3mm x 251.6mm (65.3w x 5.7h)
      const dateBox = { x: 18.3 * mmToPt, y: 251.6 * mmToPt, w: 65.3 * mmToPt, h: 5.7 * mmToPt };
      const dateText = format(new Date(ev.startAt), 'PPP p');
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(dateText, dateBox.x, dateBox.y, { width: dateBox.w, align: 'center' });

    } else {
      // ─── B: Standard Layout (Current) ──────────────────────────────────
      // Header background
      doc.rect(0, 0, pageW, 140).fill('#14b8a6');

      // Header text
      doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold')
        .text('AI Dev Community', 0, 38, { align: 'center', width: pageW });
      doc.fontSize(13).font('Helvetica')
        .text('Event Registration Badge', 0, 75, { align: 'center', width: pageW });

      // White card area
      const cardX = 50, cardY = 155, cardW = pageW - 100, cardH = 340;
      doc.roundedRect(cardX, cardY, cardW, cardH, 8).stroke('#14b8a6');

      // Info
      const title = ev.title || 'Event';
      doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold')
        .text(title, cardX + 20, cardY + 20, { width: cardW - 40, align: 'center' });

      let y = cardY + 70;
      doc.fillColor('#475569').fontSize(12).font('Helvetica').text('Attendee:', cardX + 20, y);
      doc.fillColor('#14b8a6').fontSize(14).font('Helvetica-Bold')
        .text(registration.user.displayName || registration.user.email, cardX + 20, y + 16);
      y += 48;

      doc.fillColor('#475569').fontSize(12).font('Helvetica').text('Date:', cardX + 20, y);
      doc.fillColor('#1e293b').fontSize(12).font('Helvetica')
        .text(format(new Date(ev.startAt), 'PPP p'), cardX + 20, y + 16);
      y += 44;

      doc.fillColor('#475569').fontSize(12).font('Helvetica').text('Location:', cardX + 20, y);
      doc.fillColor('#1e293b').fontSize(12).font('Helvetica')
        .text(ev.locationText || ev.location || 'TBA', cardX + 20, y + 16, { width: cardW - 40 });
      
      const qrSize = 120;
      const qrX = (pageW - qrSize) / 2;
      const qrY = cardY + cardH + 20;
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Scan for verification', 0, qrY + qrSize + 6, { align: 'center', width: pageW });

      // Footer
      const footerY = pageH - 70;
      doc.rect(0, footerY, pageW, 70).fill('#f8fafc');
      doc.moveTo(0, footerY).lineTo(pageW, footerY).stroke('#14b8a6');
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text('Contact Us:', 0, footerY + 10, { align: 'center', width: pageW });
      doc.font('Helvetica').fontSize(8).text('Email: contactaidevcommunity@gmail.com', 0, footerY + 24, { align: 'center', width: pageW });
    }

    doc.end();
  });
}

/**
 * POST /events/:id/register-guest
 * Public route — creates a new user account from visitor data and registers them for the event in one step.
 */
export const registerAsGuest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    displayName,
    email,
    password,
    phone,
    studyLevel,
    studyProgram,
    github,
    linkedin,
  } = req.body;

  // Validate required fields
  if (!displayName || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Name, email and password are required'
    });
  }

  // Validate password strength
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters'
    });
  }

  // Fetch event and check it allows guest registration
  const event = await prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { registrations: true } } }
  });

  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found' });
  }

  if (!event.allowGuestRegistration) {
    return res.status(403).json({
      success: false,
      error: 'This event does not allow visitor registration. Please create an account first.'
    });
  }

  // Check capacity
  if (event._count.registrations >= event.capacity) {
    return res.status(400).json({ success: false, error: 'Event is at full capacity' });
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(409).json({
      success: false,
      error: 'An account with this email already exists. Please log in to register for this event.',
      code: 'EMAIL_EXISTS'
    });
  }

  // Hash password and create user account
  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      role: 'USER',
      studyLevel: (studyLevel as any) || null,
      studyProgram: (studyProgram as any) || null,
      github: github || null,
      linkedin: linkedin || null,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      studyLevel: true,
      studyProgram: true,
      github: true,
      linkedin: true,
      createdAt: true
    }
  });

  // Create JWT tokens
  const accessToken = jwt.sign(
    { id: newUser.id, email: newUser.email, role: newUser.role },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    { id: newUser.id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } as jwt.SignOptions
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: newUser.id, expiresAt }
  });

  // Register for the event
  const qrToken = uuidv4();
  const guestCustomFieldValues = req.body.customFieldValues || null;

  const registration = await prisma.registration.create({
    data: {
      eventId: id,
      userId: newUser.id,
      qrToken,
      status: 'PENDING',
      ...(guestCustomFieldValues ? { customFieldValues: guestCustomFieldValues } : {})
    },
    include: {
      event: true,
      user: {
        select: { displayName: true, email: true }
      }
    }
  });

  // Welcome notification
  await prisma.notification.create({
    data: {
      userId: newUser.id,
      type: 'EVENT_CONFIRMATION',
      title: 'Welcome & Registration Pending',
      content: `Welcome to AI Dev Community! Your registration for "${event.title}" is pending staff approval.`
    }
  });

  res.status(201).json({
    success: true,
    message: 'Account created and registration submitted — awaiting staff approval',
    data: {
      user: newUser,
      accessToken,
      refreshToken,
      registration
    }
  });
});
