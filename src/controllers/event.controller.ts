import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

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
    speaker
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
      organizerId: req.user!.id
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

  // Generate QR token
  const qrToken = uuidv4();

  // Create registration
  const registration = await prisma.registration.create({
    data: {
      eventId: id,
      userId: req.user!.id,
      qrToken,
      status: 'REGISTERED'
    },
    include: {
      event: true,
      user: {
        select: {
          displayName: true,
          email: true,
          photoUrl: true
        }
      }
    }
  });

  // Create notification
  await prisma.notification.create({
    data: {
      userId: req.user!.id,
      type: 'EVENT_CONFIRMATION',
      title: 'Event Registration Confirmed',
      content: `You have successfully registered for ${event.title}`
    }
  });

  res.status(201).json({
    success: true,
    data: registration
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
    tags
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
      tags
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
