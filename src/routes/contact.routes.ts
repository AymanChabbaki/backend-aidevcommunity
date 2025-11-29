import { Router } from 'express';
import { 
  sendContactMessage,
  getContactMessages,
  getContactMessage,
  updateContactMessageStatus,
  deleteContactMessage,
  getContactStats
} from '../controllers/contact.controller';
import { validateRequest } from '../middleware/validate';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public route
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('message').trim().notEmpty().withMessage('Message is required'),
  ],
  validateRequest,
  sendContactMessage
);

// Admin routes
router.get('/messages', authenticate, authorize('ADMIN'), getContactMessages);
router.get('/messages/stats', authenticate, authorize('ADMIN'), getContactStats);
router.get('/messages/:id', authenticate, authorize('ADMIN'), getContactMessage);
router.patch('/messages/:id/status', authenticate, authorize('ADMIN'), updateContactMessageStatus);
router.delete('/messages/:id', authenticate, authorize('ADMIN'), deleteContactMessage);

export default router;
