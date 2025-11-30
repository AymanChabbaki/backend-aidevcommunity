import { Router } from 'express';
import { getMe, updateProfile, uploadProfilePhoto, getPublicMembers, changePassword } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/public', getPublicMembers);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateProfile);
router.post('/me/photo', authenticate, upload.single('photo'), uploadProfilePhoto);
router.put('/me/password', authenticate, changePassword);

export default router;
