import express from 'express';
import * as collaborationController from '../controllers/collaboration.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication and staff/admin role
router.use(authenticateToken);
router.use(requireRole(['STAFF', 'ADMIN']));

// Get all staff members (for inviting)
router.get('/staff-members', collaborationController.getStaffMembers);

// Get user's collaboration invitations
router.get('/my-invitations', collaborationController.getMyInvitations);

// Get events where user is a collaborator
router.get('/my-collaborations', collaborationController.getMyCollaborations);

// Respond to invitation
router.post('/invitations/:collaborationId/respond', collaborationController.respondToInvitation);

// Event-specific routes
router.post('/events/:eventId/collaborators', collaborationController.inviteCollaborator);
router.get('/events/:eventId/collaborators', collaborationController.getEventCollaborators);
router.delete('/collaborators/:collaborationId', collaborationController.removeCollaborator);
router.patch('/collaborators/:collaborationId', collaborationController.updateCollaboratorPermissions);

export default router;
