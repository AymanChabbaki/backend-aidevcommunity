import { Router } from 'express';
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  registerForEvent,
  checkIn,
  getEventRegistrations,
  exportRegistrations,
  getMyRegistrations
} from '../controllers/event.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', getAllEvents);
router.get('/:id', getEventById);

// Protected routes
router.get('/user/registrations', authenticate, getMyRegistrations);
router.post('/', authenticate, authorize('STAFF', 'ADMIN'), createEvent);
router.put('/:id', authenticate, authorize('STAFF', 'ADMIN'), updateEvent);
router.delete('/:id', authenticate, authorize('STAFF', 'ADMIN'), deleteEvent);
router.post('/:id/register', authenticate, registerForEvent);
router.post('/:id/checkin', authenticate, authorize('STAFF', 'ADMIN'), checkIn);
router.get('/:id/registrations', authenticate, authorize('STAFF', 'ADMIN'), getEventRegistrations);
router.get('/:id/registrations/export', authenticate, authorize('STAFF', 'ADMIN'), exportRegistrations);

export default router;
