import axios from 'axios';
import prisma from '../lib/prisma';
import { initFirebaseAdmin } from './firebaseAdmin';

initFirebaseAdmin();
const admin = require('firebase-admin');

export async function fetchAdkarSnippet() {
  try {
    const r = await axios.get('https://raw.githubusercontent.com/nawafalqari/azkar-api/main/azkar.json', { timeout: 10000 });
    const data = r.data;

    // Strategy 1: array of categories -> first.azkar[0].zekr
    if (Array.isArray(data) && data.length > 0) {
      for (const cat of data) {
        if (cat && Array.isArray(cat.azkar) && cat.azkar.length > 0 && cat.azkar[0].zekr) {
          return String(cat.azkar[0].zekr).slice(0, 240);
        }
      }
    }

    // Strategy 2: object with categories
    if (data && typeof data === 'object') {
      // Traverse values looking for a zekr string
      const queue: any[] = [data];
      while (queue.length) {
        const node = queue.shift();
        if (!node) continue;
        if (Array.isArray(node)) {
          for (const item of node) queue.push(item);
        } else if (typeof node === 'object') {
          for (const k of Object.keys(node)) {
            const v = node[k];
            if (typeof v === 'string' && v.length > 10) {
              // heuristics: return first sizeable string
              return String(v).slice(0, 240);
            }
            queue.push(v);
          }
        }
      }
    }
  } catch (e: any) {
    // log for diagnostics
    // eslint-disable-next-line no-console
    console.error('[Adkar] fetch error:', (e as any)?.message || String(e));
  }
  return '';
}

export async function sendPrayerNotification(prayerName: string, title?: string, body?: string) {
  // Fetch tokens from DB
  let tokens: { token: string }[] = [];
  try {
    tokens = await prisma.fcmToken.findMany({ select: { token: true } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[FCM] Failed to fetch tokens from DB', err);
    return { sent: 0 };
  }
  const tokenList = tokens.map((t) => t.token);
  // Diagnostic logs
  // eslint-disable-next-line no-console
  console.log('[FCM] Tokens fetched count:', tokenList.length);
  if (tokenList.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[FCM] Sample token:', tokenList[0].slice(0, 20) + '...');
  }
  if (!tokenList.length) {
    console.log('No FCM tokens stored');
    return { sent: 0 };
  }

  const adkarSnippet = await fetchAdkarSnippet();
  const notificationBody = body || (adkarSnippet ? `${prayerName} — ${adkarSnippet}` : `It's time for ${prayerName}`);

  let totalSent = 0;

  // send in batches
  const chunkSize = 500;
  for (let i = 0; i < tokenList.length; i += chunkSize) {
    const chunk = tokenList.slice(i, i + chunkSize);
    const message: any = {
      tokens: chunk,
      notification: {
        title: title || `${prayerName} time`,
        body: notificationBody,
      },
      android: { priority: 'high' },
      webpush: { notification: { icon: '/Podcast.png' } },
      data: { prayer: prayerName },
    };

    try {
      let resp: any | undefined;
      if (typeof admin.messaging().sendMulticast === 'function') {
        resp = await admin.messaging().sendMulticast(message);
        console.log(`Sent multicast for ${prayerName}:`, resp.successCount, 'success', resp.failureCount, 'failure');
        totalSent += resp.successCount || 0;
      } else {
        // Fallback: send single messages when sendMulticast is unavailable
        console.log('[FCM] sendMulticast unavailable; falling back to per-token send');
        for (const t of chunk) {
          try {
            const singleMsg: any = {
              token: t,
              notification: message.notification,
              android: message.android,
              webpush: message.webpush,
              data: message.data,
            };
            const r = await admin.messaging().send(singleMsg);
            // If send returns a message id, count as success
            if (r) totalSent += 1;
          } catch (e) {
            // ignore per-token errors but log for diagnostics
            // eslint-disable-next-line no-console
            console.error('[FCM] per-token send error', (e as any)?.message || String(e));
          }
        }
      }

      if (resp && resp.failureCount) {
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

export default sendPrayerNotification;

// Backwards-compatible wrapper for Maghrib
export async function sendMaghribNotification() {
  return sendPrayerNotification('Maghrib', "Maghrib — It's Iftar time");
}
