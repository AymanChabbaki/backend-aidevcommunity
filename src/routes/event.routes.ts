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
import { upload } from '../middleware/upload';

const router = Router();

// Public routes
router.get('/', getAllEvents);
router.get('/:id', getEventById);

// Protected routes
router.get('/user/registrations', authenticate, getMyRegistrations);
router.post('/upload-image', authenticate, authorize('STAFF', 'ADMIN'), upload.single('image'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = (req.file as any).path || `/uploads/${req.file.filename}`;
    res.json({ success: true, data: { imageUrl } });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
});
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
