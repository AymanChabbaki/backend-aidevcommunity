import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

// Get all staff members (for inviting)
export const getStaffMembers = async (req: AuthRequest, res: Response) => {
  try {
    const staffMembers = await prisma.user.findMany({
      where: {
        role: { in: ['STAFF', 'ADMIN'] }
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        photoUrl: true,
        staffRole: true,
        role: true
      },
      orderBy: {
        displayName: 'asc'
      }
    });

    res.json({
      success: true,
      data: staffMembers
    });
  } catch (error: any) {
    console.error('Error fetching staff members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff members'
    });
  }
};

// Invite collaborator to event
export const inviteCollaborator = async (req: AuthRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const { userId, role, permissions } = req.body;
    const inviterId = req.user!.id;

    // Check if event exists and user is the organizer or admin
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    if (event.organizerId !== inviterId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only the event organizer can invite collaborators'
      });
    }

    // Check if user is already a collaborator
    const existingCollaborator = await prisma.eventCollaborator.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId
        }
      }
    });

    if (existingCollaborator) {
      return res.status(400).json({
        success: false,
        error: 'User is already a collaborator on this event'
      });
    }

    // Check if user is the organizer
    if (event.organizerId === userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot add organizer as collaborator'
      });
    }

    // Create collaboration
    const collaboration = await prisma.eventCollaborator.create({
      data: {
        eventId,
        userId,
        role: role || 'COLLABORATOR',
        permissions: permissions || { canEdit: true, canApprove: true, canManageRegistrations: true },
        invitedBy: inviterId,
        status: 'PENDING'
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            photoUrl: true,
            staffRole: true,
            role: true
          }
        },
        inviter: {
          select: {
            displayName: true
          }
        }
      }
    });

    // Create notification for invited user
    await prisma.notification.create({
      data: {
        userId,
        title: 'Event Collaboration Invitation',
        content: `${collaboration.inviter.displayName} invited you to collaborate on "${event.title}"`,
        type: 'COLLABORATION_INVITE'
      }
    });

    res.json({
      success: true,
      data: collaboration
    });
  } catch (error: any) {
    console.error('Error inviting collaborator:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invite collaborator'
    });
  }
};

// Get event collaborators
export const getEventCollaborators = async (req: AuthRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    const collaborators = await prisma.eventCollaborator.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            photoUrl: true,
            staffRole: true,
            role: true
          }
        },
        inviter: {
          select: {
            displayName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: collaborators
    });
  } catch (error: any) {
    console.error('Error fetching collaborators:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch collaborators'
    });
  }
};

// Get user's collaboration invitations
export const getMyInvitations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const invitations = await prisma.eventCollaborator.findMany({
      where: {
        userId,
        status: 'PENDING'
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            startAt: true,
            endAt: true,
            imageUrl: true,
            status: true,
            organizer: {
              select: {
                displayName: true,
                photoUrl: true
              }
            }
          }
        },
        inviter: {
          select: {
            displayName: true,
            photoUrl: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: invitations
    });
  } catch (error: any) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitations'
    });
  }
};

// Respond to collaboration invitation
export const respondToInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const { collaborationId } = req.params;
    const { status } = req.body; // ACCEPTED or DECLINED
    const userId = req.user!.id;

    const collaboration = await prisma.eventCollaborator.findUnique({
      where: { id: collaborationId },
      include: {
        event: {
          select: {
            title: true,
            organizerId: true
          }
        }
      }
    });

    if (!collaboration) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found'
      });
    }

    if (collaboration.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to respond to this invitation'
      });
    }

    if (collaboration.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Invitation has already been responded to'
      });
    }

    const updated = await prisma.eventCollaborator.update({
      where: { id: collaborationId },
      data: { status },
      include: {
        user: {
          select: {
            displayName: true
          }
        }
      }
    });

    // Notify organizer
    if (status === 'ACCEPTED') {
      await prisma.notification.create({
        data: {
          userId: collaboration.event.organizerId,
          title: 'Collaboration Accepted',
          content: `${updated.user.displayName} accepted your collaboration invitation for "${collaboration.event.title}"`,
          type: 'COLLABORATION_ACCEPTED'
        }
      });
    }

    res.json({
      success: true,
      data: updated
    });
  } catch (error: any) {
    console.error('Error responding to invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to respond to invitation'
    });
  }
};

// Remove collaborator
export const removeCollaborator = async (req: AuthRequest, res: Response) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user!.id;

    const collaboration = await prisma.eventCollaborator.findUnique({
      where: { id: collaborationId },
      include: {
        event: true
      }
    });

    if (!collaboration) {
      return res.status(404).json({
        success: false,
        error: 'Collaborator not found'
      });
    }

    // Only organizer or admin can remove collaborators
    if (collaboration.event.organizerId !== userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only the event organizer can remove collaborators'
      });
    }

    await prisma.eventCollaborator.delete({
      where: { id: collaborationId }
    });

    res.json({
      success: true,
      message: 'Collaborator removed successfully'
    });
  } catch (error: any) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove collaborator'
    });
  }
};

// Update collaborator permissions
export const updateCollaboratorPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { collaborationId } = req.params;
    const { role, permissions } = req.body;
    const userId = req.user!.id;

    const collaboration = await prisma.eventCollaborator.findUnique({
      where: { id: collaborationId },
      include: {
        event: true
      }
    });

    if (!collaboration) {
      return res.status(404).json({
        success: false,
        error: 'Collaborator not found'
      });
    }

    // Only organizer or admin can update permissions
    if (collaboration.event.organizerId !== userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only the event organizer can update permissions'
      });
    }

    const updated = await prisma.eventCollaborator.update({
      where: { id: collaborationId },
      data: {
        role,
        permissions
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            photoUrl: true,
            staffRole: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error: any) {
    console.error('Error updating permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update permissions'
    });
  }
};

// Get events where user is a collaborator
export const getMyCollaborations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const collaborations = await prisma.eventCollaborator.findMany({
      where: {
        userId,
        status: 'ACCEPTED'
      },
      include: {
        event: {
          include: {
            organizer: {
              select: {
                displayName: true,
                photoUrl: true
              }
            },
            _count: {
              select: {
                registrations: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: collaborations
    });
  } catch (error: any) {
    console.error('Error fetching collaborations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch collaborations'
    });
  }
};
