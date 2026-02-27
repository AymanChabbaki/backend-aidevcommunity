import { Router } from 'express';
import { registerToken, listTokens, deleteToken, sendMaghribNow } from '../controllers/fcm.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public register endpoint (clients will post token)
router.post('/register', registerToken);

// Admin endpoints
router.get('/list', authenticate, listTokens);
router.delete('/delete', authenticate, deleteToken);
// Protected trigger for hosts without persistent schedulers (call with x-scheduler-token header)
router.post('/send-maghrib-now', sendMaghribNow);
// Debug endpoints protected by scheduler token
router.post('/debug-list', debugListTokens);
router.post('/send-to-token', sendToToken);

export default router;
