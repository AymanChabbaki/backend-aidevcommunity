import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getHomeContent, updateHomeContent, initializeHomeContent } from '../controllers/home-content.controller';

const router = Router();

// Public route - anyone can view home content
router.get('/', getHomeContent);

// Admin only routes
router.post('/initialize', authenticate, authorize('ADMIN'), initializeHomeContent);
router.put('/', authenticate, authorize('ADMIN'), updateHomeContent);

export default router;
