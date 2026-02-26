import axios from 'axios';
import prisma from '../lib/prisma';
import { initFirebaseAdmin } from './firebaseAdmin';

initFirebaseAdmin();
const admin = require('firebase-admin');

export async function sendMaghribNotification() {
  // Fetch tokens from DB
  const tokens = await prisma.fcmToken.findMany({ select: { token: true } });
  const tokenList = tokens.map((t) => t.token);
  if (!tokenList.length) {
    console.log('No FCM tokens stored');
    return { sent: 0 };
  }

  // Optional short adkar snippet
  let adkarSnippet = '';
  try {
    const r = await axios.get('https://raw.githubusercontent.com/nawafalqari/azkar-api/main/azkar.json', { timeout: 10000 });
    const data = r.data;
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first?.azkar && first.azkar[0]?.zekr) {
        adkarSnippet = first.azkar[0].zekr.slice(0, 120);
      }
    }
  } catch (e) {
    // ignore
  }

  const notificationBody = adkarSnippet ? `It's time for Iftar — ${adkarSnippet}` : "It's time for Iftar!";

  let totalSent = 0;

  // send in batches
  const chunkSize = 500;
  for (let i = 0; i < tokenList.length; i += chunkSize) {
    const chunk = tokenList.slice(i, i + chunkSize);
    const message: any = {
      tokens: chunk,
      notification: {
        title: "Maghrib — It's Iftar time",
        body: notificationBody,
      },
      android: { priority: 'high' },
      webpush: { notification: { icon: '/Podcast.png' } },
    };

    try {
      const resp = await admin.messaging().sendMulticast(message);
      console.log('Sent multicast:', resp.successCount, 'success', resp.failureCount, 'failure');
      totalSent += resp.successCount || 0;
      if (resp.failureCount) {
        const invalid: string[] = [];
        resp.responses.forEach((r: any, idx: number) => {
          if (!r.success) {
            const err = r.error;
            if (err && (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token')) {
              invalid.push(chunk[idx]);
            }
          }
        });
        if (invalid.length) {
          await prisma.fcmToken.deleteMany({ where: { token: { in: invalid } } });
          console.log('Removed invalid tokens:', invalid.length);
        }
      }
    } catch (err) {
      console.error('Error sending multicast', err);
    }
  }

  return { sent: totalSent };
}

export default sendMaghribNotification;
