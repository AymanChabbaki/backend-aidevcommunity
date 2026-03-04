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
    eligibleLevels,
    eligiblePrograms
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
      eligibleLevels: eligibleLevels || [],
      eligiblePrograms: eligiblePrograms || []
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

  // Always start as PENDING — staff/admin must approve
  const status = 'PENDING';

  // Create registration
  const registration = await prisma.registration.create({
    data: {
      eventId: id,
      userId: req.user!.id,
      qrToken,
      status
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
  if (eligibleLevels !== undefined) updateData.eligibleLevels = eligibleLevels;
  if (eligiblePrograms !== undefined) updateData.eligiblePrograms = eligiblePrograms;

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
          organizerId: true
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
      event: true,
      user: { select: { id: true, displayName: true, email: true } }
    }
  });

  if (!registration || registration.qrToken !== token) {
    return res.status(404).json({ success: false, error: 'Badge not found or invalid token' });
  }

  if (!['APPROVED', 'REGISTERED'].includes(registration.status)) {
    return res.status(403).json({ success: false, error: 'Badge only available for approved registrations' });
  }

  // Generate QR code as PNG buffer — encode qrToken so scanner can check in
  const qrBuffer = await QRCode.toBuffer(registration.qrToken, { width: 180, margin: 1 });

  // Build PDF
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve) => {
    doc.on('end', resolve);

    const pageW = 595.28;
    const pageH = 841.89;

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

    // Event title
    const ev = registration.event as any;
    const title = ev.title || 'Event';
    doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold')
      .text(title, cardX + 20, cardY + 20, { width: cardW - 40, align: 'center' });

    let y = cardY + 70;

    // Attendee
    doc.fillColor('#475569').fontSize(12).font('Helvetica').text('Attendee:', cardX + 20, y);
    doc.fillColor('#14b8a6').fontSize(14).font('Helvetica-Bold')
      .text(registration.user.displayName || registration.user.email, cardX + 20, y + 16);
    y += 48;

    // Date
    doc.fillColor('#475569').fontSize(12).font('Helvetica').text('Date:', cardX + 20, y);
    doc.fillColor('#1e293b').fontSize(12).font('Helvetica')
      .text(format(new Date(ev.startAt), 'PPP p'), cardX + 20, y + 16);
    y += 44;

    // Location
    doc.fillColor('#475569').fontSize(12).font('Helvetica').text('Location:', cardX + 20, y);
    doc.fillColor('#1e293b').fontSize(12).font('Helvetica')
      .text(ev.locationText || ev.location || 'TBA', cardX + 20, y + 16, { width: cardW - 40 });
    y += 48;

    // Registration ID
    doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
      .text(`Registration ID: ${registration.id}`, cardX + 20, y, { width: cardW - 40 });

    // QR code
    const qrSize = 120;
    const qrX = (pageW - qrSize) / 2;
    const qrY = cardY + cardH + 20;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.fillColor('#475569').fontSize(9).font('Helvetica')
      .text('Scan for verification', 0, qrY + qrSize + 6, { align: 'center', width: pageW });

    // Footer
    const footerY = pageH - 70;
    doc.rect(0, footerY, pageW, 70).fill('#f8fafc');
    doc.moveTo(0, footerY).lineTo(pageW, footerY).stroke('#14b8a6');
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold')
      .text('Contact Us:', 0, footerY + 10, { align: 'center', width: pageW });
    doc.font('Helvetica').fontSize(8)
      .text('Email: contactaidevcommunity@gmail.com', 0, footerY + 24, { align: 'center', width: pageW })
      .text('Phone: +212 687830201', 0, footerY + 36, { align: 'center', width: pageW })
      .text("Location: Faculty of Science Ben M'sik, Casablanca, Morocco", 0, footerY + 48, { align: 'center', width: pageW });

    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const safeName = registration.event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="badge-${safeName}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});
