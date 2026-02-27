import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

export const registerToken = asyncHandler(async (req: Request, res: Response) => {
  const { token, userId, platform } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'token is required' });

  // Upsert token
  const existing = await prisma.fcmToken.findUnique({ where: { token } });
  if (existing) {
    await prisma.fcmToken.update({ where: { token }, data: { userId: userId || existing.userId, platform: platform || existing.platform } });
    return res.json({ success: true, token: existing.token });
  }

  const created = await prisma.fcmToken.create({ data: { token, userId: userId || undefined, platform: platform || undefined } });
  res.json({ success: true, token: created.token });
});

export const listTokens = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await prisma.fcmToken.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: tokens });
});

export const deleteToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'token is required' });

  await prisma.fcmToken.deleteMany({ where: { token } });
  res.json({ success: true });
});

export const sendMaghribNow = asyncHandler(async (req: Request, res: Response) => {
  // Protected by scheduler token or admin auth
  const headerToken = (req.headers['x-scheduler-token'] as string) || req.headers['x-scheduler-token'];
  const envToken = process.env.SCHEDULER_ADMIN_TOKEN;
  if (!envToken) return res.status(500).json({ success: false, error: 'Scheduler token not configured' });
  if (!headerToken || headerToken !== envToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  // Lazy import to avoid cycles
  const { sendMaghribNotification } = await import('../fcm/sendPrayer');
  const result = await sendMaghribNotification();
  res.json({ success: true, sent: result?.sent || 0 });
});

export const sendPrayerNow = asyncHandler(async (req: Request, res: Response) => {
  const headerToken = (req.headers['x-scheduler-token'] as string) || req.headers['x-scheduler-token'];
  const envToken = process.env.SCHEDULER_ADMIN_TOKEN;
  if (!envToken) return res.status(500).json({ success: false, error: 'Scheduler token not configured' });
  if (!headerToken || headerToken !== envToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { prayer } = req.body as { prayer?: string };
  const p = prayer || 'Maghrib';
  const { sendPrayerNotification } = await import('../fcm/sendPrayer');
  const result = await sendPrayerNotification(p);
  res.json({ success: true, prayer: p, sent: result?.sent || 0 });
});

export const sendAdkarNow = asyncHandler(async (req: Request, res: Response) => {
  const headerToken = (req.headers['x-scheduler-token'] as string) || req.headers['x-scheduler-token'];
  const envToken = process.env.SCHEDULER_ADMIN_TOKEN;
  if (!envToken) return res.status(500).json({ success: false, error: 'Scheduler token not configured' });
  if (!headerToken || headerToken !== envToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  // Lazy load fetchAdkarSnippet from sendPrayer
  const mod = await import('../fcm/sendPrayer');
  const snippet = await (mod.fetchAdkarSnippet ? mod.fetchAdkarSnippet() : Promise.resolve(''));
  // send as a generic notification to all tokens
  if (!snippet) return res.status(500).json({ success: false, error: 'Failed to fetch adkar snippet' });
  const { sendPrayerNotification } = mod;
  const result = await sendPrayerNotification('Adkar', 'Adkar', snippet.slice(0, 240));
  res.json({ success: true, sent: result?.sent || 0 });
});

export const debugListTokens = asyncHandler(async (req: Request, res: Response) => {
  const headerToken = (req.headers['x-scheduler-token'] as string) || req.headers['x-scheduler-token'];
  const envToken = process.env.SCHEDULER_ADMIN_TOKEN;
  if (!envToken) return res.status(500).json({ success: false, error: 'Scheduler token not configured' });
  if (!headerToken || headerToken !== envToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const tokens = await prisma.fcmToken.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ success: true, count: tokens.length, data: tokens });
});

export const sendToToken = asyncHandler(async (req: Request, res: Response) => {
  const headerToken = (req.headers['x-scheduler-token'] as string) || req.headers['x-scheduler-token'];
  const envToken = process.env.SCHEDULER_ADMIN_TOKEN;
  if (!envToken) return res.status(500).json({ success: false, error: 'Scheduler token not configured' });
  if (!headerToken || headerToken !== envToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'token is required in body' });

  // Lazy init
  const { initFirebaseAdmin } = await import('../fcm/firebaseAdmin');
  initFirebaseAdmin();
  const admin = require('firebase-admin');

  try {
    const message: any = {
      token,
      notification: { title: "Test — notification", body: "This is a test message" },
      android: { priority: 'high' },
      // Add a data payload so the service worker's background handler receives it
      // and we can ensure `onBackgroundMessage` runs across browsers.
      data: { title: 'Test — notification', body: 'This is a test message', url: process.env.FRONTEND_URL || 'https://aidevcommunity.vercel.app' },
      webpush: {
        notification: { icon: '/Podcast.png' },
        fcmOptions: { link: process.env.FRONTEND_URL || 'https://aidevcommunity.vercel.app' },
      },
    };

    // Log message payload for debugging (safe: contains only token and small message)
    // eslint-disable-next-line no-console
    console.log('[FCM] Sending test message to token:', token);
    // eslint-disable-next-line no-console
    console.log('[FCM] Message payload:', JSON.stringify(message));

    const resp = await admin.messaging().send(message);

    // Log Firebase response
    // eslint-disable-next-line no-console
    console.log('[FCM] send response:', resp);

    res.json({ success: true, result: resp });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[FCM] send error:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
});
