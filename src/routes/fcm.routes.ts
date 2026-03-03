import { Router } from 'express';
import { registerToken, listTokens, deleteToken, sendMaghribNow, debugListTokens, sendToToken, sendPrayerNow, sendAdkarNow, getMessage } from '../controllers/fcm.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public register endpoint (clients will post token)
router.post('/register', registerToken);

// Admin endpoints
router.get('/list', authenticate, listTokens);
router.delete('/delete', authenticate, deleteToken);
// Protected trigger for hosts without persistent schedulers (call with x-scheduler-token header)
router.post('/send-maghrib-now', sendMaghribNow);
// Scheduler endpoints to trigger other prayers or adkar
router.post('/send-prayer-now', sendPrayerNow);
router.post('/send-adkar-now', sendAdkarNow);
// Public endpoint to fetch stored full notification text by id
router.get('/message/:id', getMessage);
// Debug endpoints protected by scheduler token
router.post('/debug-list', debugListTokens);
router.post('/send-to-token', sendToToken);

export default router;
