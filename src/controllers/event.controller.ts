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
        subEvents: {
          orderBy: { startAt: 'asc' }
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
      subEvents: {
        orderBy: { startAt: 'asc' }
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
    useCustomBadge,
    subEvents
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
      useCustomBadge: useCustomBadge || false,
      subEvents: subEvents && subEvents.length > 0 ? {
        create: subEvents.map((se: any) => ({
          title: se.title,
          description: se.description,
          startAt: new Date(se.startAt),
          endAt: new Date(se.endAt),
          location: se.location
        }))
      } : undefined
    },
    include: {
      subEvents: true
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
  const { token, subEventId } = req.body;

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
      event: { 
        include: { 
          subEvents: true 
        } 
      }
    }
  });

  if (!registration) {
    return res.status(404).json({ success: false, error: 'Invalid QR code — registration not found' });
  }

  if (!['APPROVED', 'REGISTERED'].includes(registration.status)) {
    return res.status(403).json({ success: false, error: 'Registration is not approved' });
  }

  // Handle Sub-Event Check-in
  if (subEventId) {
    const subEvent = (registration.event as any).subEvents.find((se: any) => se.id === subEventId);
    if (!subEvent) {
      return res.status(404).json({ success: false, error: 'Sub-event not found in this event' });
    }

    const existingCheckIn = await prisma.subEventCheckIn.findUnique({
      where: { 
        subEventId_registrationId: { 
          subEventId, 
          registrationId: registration.id 
        } 
      }
    });

    if (existingCheckIn) {
      return res.status(400).json({ 
        success: false, 
        error: 'Already checked in for this session',
        data: { name: registration.user.displayName, subEventTitle: subEvent.title }
      });
    }

    await prisma.subEventCheckIn.create({
      data: { subEventId, registrationId: registration.id }
    });

    return res.json({
      success: true,
      message: `${registration.user.displayName} checked in for ${subEvent.title}`,
      data: { name: registration.user.displayName, eventTitle: registration.event.title, subEventTitle: subEvent.title }
    });
  }

  // Standard Main Event Check-in
  if (registration.checkedInAt) {
    return res.status(400).json({
      success: false,
      error: 'Already checked in for the main event',
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

export const checkInSubEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { registrationId, subEventId } = req.body;

  if (!registrationId || !subEventId) {
    return res.status(400).json({ success: false, error: 'Missing registrationId or subEventId' });
  }

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: { include: { subEvents: true } } }
  });

  if (!registration) {
    return res.status(404).json({ success: false, error: 'Registration not found' });
  }

  const subEvent = registration.event.subEvents.find(se => se.id === subEventId);
  if (!subEvent) {
    return res.status(404).json({ success: false, error: 'Sub-event not found' });
  }

  const existingCheckIn = await prisma.subEventCheckIn.findUnique({
    where: { 
      subEventId_registrationId: { 
        subEventId, 
        registrationId 
      } 
    }
  });

  if (existingCheckIn) {
    return res.status(400).json({ success: false, error: 'Already checked in for this session' });
  }

  const checkIn = await prisma.subEventCheckIn.create({
    data: { subEventId, registrationId },
    include: { subEvent: true }
  });

  res.json({ 
    success: true, 
    message: `Checked in for ${checkIn.subEvent.title}`,
    data: checkIn 
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
          photoUrl: true,
          studyLevel: true,
          studyProgram: true
        }
      },
      subEventCheckIns: {
        include: {
          subEvent: {
            select: {
              id: true,
              title: true
            }
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

  // Handle sub-events syncing
  if (req.body.subEvents !== undefined) {
    const incomingSubEvents = req.body.subEvents as any[];
    const existingSubEvents = await prisma.subEvent.findMany({ where: { eventId: id } });
    const existingIds = existingSubEvents.map(se => se.id);
    
    const incomingIds = incomingSubEvents.filter(se => se.id).map(se => se.id);
    const toDelete = existingIds.filter(eid => !incomingIds.includes(eid));
    
    updateData.subEvents = {
      deleteMany: { id: { in: toDelete } },
      update: incomingSubEvents.filter(se => se.id && existingIds.includes(se.id)).map(se => ({
        where: { id: se.id },
        data: {
          title: se.title,
          description: se.description,
          startAt: new Date(se.startAt),
          endAt: new Date(se.endAt),
          location: se.location
        }
      })),
      create: incomingSubEvents.filter(se => !se.id).map(se => ({
        title: se.title,
        description: se.description,
        startAt: new Date(se.startAt),
        endAt: new Date(se.endAt),
        location: se.location
      }))
    };
  }

  const updatedEvent = await prisma.event.update({
    where: { id },
    data: updateData,
    include: {
      subEvents: {
        orderBy: { startAt: 'asc' }
      },
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
      event: {
        include: {
          subEvents: true
        }
      },
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
      frontendUrl: process.env.FRONTEND_URL || 'https://aidevcommunity.vercel.app',
      subEvents: (registration.event as any).subEvents || [],
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

      // 1. Event Title (High-Fidelity Wrapping Engine)
      // Box: 7mm x 51.3mm (143.7w x 28h)
      const titleBox = { x: 7 * mmToPt, y: 51.3 * mmToPt, w: 143.7 * mmToPt, h: 28 * mmToPt };
      const eventTitle = (ev.titleAr || ev.titleFr || ev.title || '').toUpperCase();
      
      let titleSize = 31;
      let titleLines: string[] = [];
      let totalHeight = 0;

      // Iterative Wrap & Shrink Loop
      while (titleSize > 8) {
        doc.font('Helvetica-Bold').fontSize(titleSize);
        const words = eventTitle.split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
          const testLine = currentLine + ' ' + words[i];
          if (doc.widthOfString(testLine) > titleBox.w * 0.95) {
            lines.push(currentLine);
            currentLine = words[i];
          } else {
            currentLine = testLine;
          }
        }
        lines.push(currentLine);

        const lineHeight = titleSize * 1.15;
        totalHeight = lines.length * lineHeight;

        if (totalHeight <= titleBox.h * 0.95 && !lines.some(l => doc.widthOfString(l) > titleBox.w * 0.95)) {
          titleLines = lines;
          break;
        }
        titleSize -= 1;
      }

      const lineHeight = titleSize * 1.15;
      let currentY = titleBox.y + (titleBox.h - totalHeight) / 2;
      
      titleLines.forEach(line => {
        // Shadow layer
        doc.fillColor('#000000').fillOpacity(0.25).text(line, titleBox.x + 0.5, currentY + 0.5, { width: titleBox.w, align: 'center' });
        // Main layer
        doc.fillColor('#FFFFFF').fillOpacity(1).text(line, titleBox.x, currentY, { width: titleBox.w, align: 'center' });
        currentY += lineHeight;
      });

      // 2. Attendee Name (White + Shadow) 
      // Box: 75.2mm x 115.8mm (94.5w x 12.2h)
      const nameBox = { x: 75.2 * mmToPt, y: 115.8 * mmToPt, w: 94.5 * mmToPt, h: 12.2 * mmToPt };
      const attendeeName = (registration.user.displayName || registration.user.email).toUpperCase();
      
      // Starting with 15mm as the peak size, matching frontend mm(15)
      let nameSize = 15 * mmToPt; 
      doc.font('Helvetica-Bold').fontSize(nameSize);
      
      // Iterative Shrink to fit width AND height constraints
      while ((doc.widthOfString(attendeeName) > nameBox.w * 0.96 || nameSize > nameBox.h * 1.5) && nameSize > 8) {
        nameSize -= 0.5;
        doc.fontSize(nameSize);
      }
      
      // Refined vertical centering for PDFKit (which uses top baseline by default)
      // Using 0.75 as an approximate cap-height factor for Helvetica-Bold
      const vCenterName = nameBox.y + (nameBox.h - nameSize * 0.75) / 2;
      
      // Shadow layer (Deep Precision)
      doc.fillColor('#000000').fillOpacity(0.35).text(attendeeName, nameBox.x + 0.6, vCenterName + 0.6, { width: nameBox.w, align: 'center' });
      // Main layer
      doc.fillColor('#FFFFFF').fillOpacity(1).text(attendeeName, nameBox.x, vCenterName, { width: nameBox.w, align: 'center' });

      // 3. QR Code (Professional Card Styling)
      // Box: 8.9mm x 154.4mm (84w x 84h)
      const qrBox = { x: 8.9 * mmToPt, y: 154.4 * mmToPt, w: 84 * mmToPt, h: 84 * mmToPt };
      const pad = 2 * mmToPt; // 2mm padding matching frontend
      
      // Shadow for QR card
      doc.roundedRect(qrBox.x - pad + 0.8, qrBox.y - pad + 0.8, qrBox.w + pad * 2, qrBox.h + pad * 2, 4 * mmToPt).fillColor('#000000').fillOpacity(0.1).fill();
      // White Board
      doc.roundedRect(qrBox.x - pad, qrBox.y - pad, qrBox.w + pad * 2, qrBox.h + pad * 2, 4 * mmToPt).fillColor('#FFFFFF').fillOpacity(1).fill();
      doc.image(qrBuffer, qrBox.x, qrBox.y, { width: qrBox.w, height: qrBox.h });

      // 4. Date (White Centered)
      // Box: 18.3mm x 251.6mm (65.3w x 5.7h)
      const dateBox = { x: 18.3 * mmToPt, y: 251.6 * mmToPt, w: 65.3 * mmToPt, h: 5.7 * mmToPt };
      const dateText = format(new Date(ev.startAt), "MMM dd, yyyy • HH:mm").toUpperCase();
      doc.font('Helvetica').fontSize(6 * mmToPt).fillColor('#FFFFFF').fillOpacity(0.9);
      doc.text(dateText, dateBox.x, dateBox.y + (dateBox.h - 6 * mmToPt) / 2, { 
        width: dateBox.w, 
        align: 'center',
        characterSpacing: 0.5
      });
      doc.fillOpacity(1); // Reset for next entries if any

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
