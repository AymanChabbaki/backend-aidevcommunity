import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead, sendBulkNotification, getAllUsers } from '../controllers/notification.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getNotifications);
router.put('/:id/read', authenticate, markAsRead);
router.put('/read-all', authenticate, markAllAsRead);
router.post('/bulk-send', authenticate, authorize('STAFF', 'ADMIN'), sendBulkNotification);
router.get('/users', authenticate, authorize('STAFF', 'ADMIN'), getAllUsers);

export default router;
