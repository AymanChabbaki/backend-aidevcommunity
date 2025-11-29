import { Router } from 'express';
import {
  getAllUsers,
  updateUserRole,
  deleteUser,
  getStats,
  getAuditLogs
} from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.get('/users', getAllUsers);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/stats', getStats);
router.get('/audit-logs', getAuditLogs);

export default router;
