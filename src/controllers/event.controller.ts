import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail, emailTemplates } from '../services/email.service';
import { format } from 'date-fns';

const prisma = new PrismaClient();

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

    res.json({
      success: true,
      data: events
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
    
    if (eligibleLevels && eligibleLevels.length > 0) {
      isEligible = isEligible && user?.studyLevel ? eligibleLevels.includes(user.studyLevel) : false;
    }
    
    if (eligiblePrograms && eligiblePrograms.length > 0) {
      isEligible = isEligible && user?.studyProgram ? eligiblePrograms.includes(user.studyProgram) : false;
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

  // Determine registration status
  const status = event.requiresApproval ? 'PENDING' : 'REGISTERED';

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
  const notificationTitle = event.requiresApproval 
    ? 'Event Registration Pending' 
    : 'Event Registration Confirmed';
  const notificationContent = event.requiresApproval
    ? `Your registration for ${event.title} is pending approval`
    : `You have successfully registered for ${event.title}`;

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
    message: event.requiresApproval 
      ? 'Registration submitted for approval' 
      : 'Registration confirmed'
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

  const updatedEvent = await prisma.event.update({
    where: { id },
    data: {
      title,
      description,
      category,
      locationType,
      locationText,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      capacity,
      speaker,
      imageUrl,
      tags,
      requiresApproval: requiresApproval !== undefined ? requiresApproval : event.requiresApproval,
      eligibleLevels: eligibleLevels !== undefined ? eligibleLevels : event.eligibleLevels,
      eligiblePrograms: eligiblePrograms !== undefined ? eligiblePrograms : event.eligiblePrograms
    },
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
  const registrations = await prisma.registration.findMany({
    where: { status: 'PENDING' },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
          requiresApproval: true,
          eligibleLevels: true,
          eligiblePrograms: true
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
      status: 'CONFIRMED',
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

  // Send approval email
  const emailTemplate = emailTemplates.registrationApproved(
    registration.user.displayName,
    registration.event.title,
    format(new Date(registration.event.startAt), 'PPP'),
    comment
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
