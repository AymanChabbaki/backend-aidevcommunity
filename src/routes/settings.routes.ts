import { Router } from 'express';
import { 
  getSettings, 
  updateSetting, 
  bulkUpdateSettings,
  deleteSetting,
  initializeSettings
} from '../controllers/settings.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All settings routes require authentication
router.use(authenticate);

// Read settings - allow ADMIN and STAFF
router.get('/', authorize('ADMIN', 'STAFF'), getSettings);

// Modify settings - only ADMIN
router.post('/initialize', authorize('ADMIN'), initializeSettings);
router.post('/', authorize('ADMIN'), updateSetting);
router.put('/bulk', authorize('ADMIN'), bulkUpdateSettings);
router.delete('/:key', authorize('ADMIN'), deleteSetting);

export default router;
