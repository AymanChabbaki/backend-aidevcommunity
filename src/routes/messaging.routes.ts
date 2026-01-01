import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getUsers,
  getEventsWithUsers,
  getEventUsers,
  sendMessageToUsers,
} from '../controllers/messaging.controller';

const router = Router();

// All routes require authentication and STAFF or ADMIN role
router.use(authenticate, authorize('STAFF', 'ADMIN'));

// Get all users for selection
router.get('/users', getUsers);

// Get events with registered users
router.get('/events', getEventsWithUsers);

// Get users registered for specific event
router.get('/events/:eventId/users', getEventUsers);

// Send message to selected users
router.post('/send', sendMessageToUsers);

export default router;
