import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead, sendBulkNotification, getAllUsers } from '../controllers/notification.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getNotifications);
router.put('/:id/read', authenticate, markAsRead);
router.put('/read-all', authenticate, markAllAsRead);
router.post('/bulk-send', authenticate, requireRole(['STAFF', 'ADMIN']), sendBulkNotification);
router.get('/users', authenticate, requireRole(['STAFF', 'ADMIN']), getAllUsers);

export default router;
