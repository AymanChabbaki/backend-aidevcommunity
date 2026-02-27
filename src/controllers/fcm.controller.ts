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
  const { sendMaghribNotification } = await import('../fcm/sendMaghrib');
  const result = await sendMaghribNotification();
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
      webpush: { notification: { icon: '/Podcast.png' } },
    };
    const resp = await admin.messaging().send(message);
    res.json({ success: true, result: resp });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || err });
  }
});
