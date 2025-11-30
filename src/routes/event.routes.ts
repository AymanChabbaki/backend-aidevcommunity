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
  getMyRegistrations,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration
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

// Registration approval routes
router.get('/registrations/pending', authenticate, authorize('STAFF', 'ADMIN'), getPendingRegistrations);
router.put('/registrations/:id/approve', authenticate, authorize('STAFF', 'ADMIN'), approveRegistration);
router.put('/registrations/:id/reject', authenticate, authorize('STAFF', 'ADMIN'), rejectRegistration);

export default router;
