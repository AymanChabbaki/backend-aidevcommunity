import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

export const getHomeContent = async (req: AuthRequest, res: Response) => {
  try {
    const content = await prisma.homeContent.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!content) {
      // Return default content if none exists
      return res.json({
        heroTitle: 'Welcome to AI Dev Community',
        heroSubtitle: 'Join us in exploring the future of artificial intelligence and machine learning',
        heroCtaText: 'Get Started',
        heroCtaLink: '/register',
        featuredEventIds: [],
        showPastEvents: true,
        statsEnabled: true,
        totalEvents: 0,
        totalMembers: 0,
        activeProjects: 0
      });
    }

    // Clean up featured event IDs - remove IDs of deleted events
    const featuredIds = content.featuredEventIds as string[];
    if (featuredIds && Array.isArray(featuredIds) && featuredIds.length > 0) {
      const existingEvents = await prisma.event.findMany({
        where: {
          id: { in: featuredIds }
        },
        select: { id: true }
      });

      const existingEventIds = existingEvents.map(e => e.id);
      const cleanedIds = featuredIds.filter((id: string) => existingEventIds.includes(id));

      // Update content if IDs were removed
      if (cleanedIds.length !== featuredIds.length) {
        await prisma.homeContent.update({
          where: { id: content.id },
          data: { featuredEventIds: cleanedIds }
        });
        content.featuredEventIds = cleanedIds as any;
      }
    }

    res.json(content);
  } catch (error) {
    console.error('Error fetching home content:', error);
    res.status(500).json({ message: 'Failed to fetch home content' });
  }
};

export const updateHomeContent = async (req: AuthRequest, res: Response) => {
  try {
    const {
      heroTitle,
      heroSubtitle,
      heroCtaText,
      heroCtaLink,
      featuredEventIds,
      showPastEvents,
      statsEnabled,
      totalEvents,
      totalMembers,
      activeProjects
    } = req.body;

    // Validate featured event IDs - ensure all events exist
    let validFeaturedEventIds = featuredEventIds || [];
    if (validFeaturedEventIds.length > 0) {
      const existingEvents = await prisma.event.findMany({
        where: {
          id: { in: validFeaturedEventIds }
        },
        select: { id: true }
      });
      const existingEventIds = existingEvents.map(e => e.id);
      validFeaturedEventIds = validFeaturedEventIds.filter((id: string) => existingEventIds.includes(id));
    }

    // Get existing content or create new
    const existing = await prisma.homeContent.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    let content;
    if (existing) {
      content = await prisma.homeContent.update({
        where: { id: existing.id },
        data: {
          heroTitle,
          heroSubtitle,
          heroCtaText,
          heroCtaLink,
          featuredEventIds: validFeaturedEventIds,
          showPastEvents,
          statsEnabled,
          totalEvents,
          totalMembers,
          activeProjects
        }
      });
    } else {
      content = await prisma.homeContent.create({
        data: {
          heroTitle,
          heroSubtitle,
          heroCtaText,
          heroCtaLink,
          featuredEventIds: validFeaturedEventIds,
          showPastEvents,
          statsEnabled,
          totalEvents,
          totalMembers,
          activeProjects
        }
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: existing ? 'UPDATE' : 'CREATE',
        entity: 'home_content',
        entityId: content.id,
        metadata: { changes: req.body }
      }
    });

    res.json(content);
  } catch (error) {
    console.error('Error updating home content:', error);
    res.status(500).json({ message: 'Failed to update home content' });
  }
};

export const initializeHomeContent = async (req: AuthRequest, res: Response) => {
  try {
    // Check if content already exists
    const existing = await prisma.homeContent.findFirst();
    if (existing) {
      return res.json({ message: 'Home content already initialized', content: existing });
    }

    // Get event and user counts
    const eventCount = await prisma.event.count();
    const userCount = await prisma.user.count();

    const content = await prisma.homeContent.create({
      data: {
        heroTitle: 'Welcome to AI Dev Community',
        heroSubtitle: 'Join us in exploring the future of artificial intelligence and machine learning. Connect with like-minded developers, attend workshops, and build amazing projects together.',
        heroCtaText: 'Explore Events',
        heroCtaLink: '/events',
        featuredEventIds: [],
        showPastEvents: true,
        statsEnabled: true,
        totalEvents: eventCount,
        totalMembers: userCount,
        activeProjects: 12
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'INITIALIZE',
        entity: 'home_content',
        entityId: content.id,
        metadata: { message: 'Home content initialized' }
      }
    });

    res.json({ message: 'Home content initialized successfully', content });
  } catch (error) {
    console.error('Error initializing home content:', error);
    res.status(500).json({ message: 'Failed to initialize home content' });
  }
};
