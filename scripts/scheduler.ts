import axios from 'axios';
import moment from 'moment-timezone';
import prisma from '../src/lib/prisma';
import { initFirebaseAdmin } from '../src/fcm/firebaseAdmin';
import { sendPrayerNotification } from '../src/fcm/sendPrayer';

// Initialize Firebase Admin
initFirebaseAdmin();
const admin = require('firebase-admin');

const TZ = process.env.TIMEZONE || 'Africa/Casablanca';

async function fetchTimingsForToday() {
  const apiUrl = 'https://api.aladhan.com/v1/timingsByCity';
  const res = await axios.get(apiUrl, {
    params: {
      city: 'Casablanca',
      country: 'Morocco',
      method: 2,
    },
    timeout: 10000,
  });
  return res.data?.data;
}

async function schedulePrayersForToday() {
  try {
    const data = await fetchTimingsForToday();
    const timings = data?.timings;
    const dateInfo = data?.date;
    if (!timings) {
      console.error('Timings not found in Aladhan response');
      return;
    }

    // Choose prayer names to schedule
    const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const gregDate = dateInfo?.gregorian?.date; // 'DD-MM-YYYY'
    let [day, month, year] = [null, null, null];
    if (gregDate && gregDate.includes('-')) {
      [day, month, year] = gregDate.split('-');
    } else {
      const d = new Date();
      day = String(d.getDate()).padStart(2, '0');
      month = String(d.getMonth() + 1).padStart(2, '0');
      year = String(d.getFullYear());
    }

    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD
    const now = moment.tz(TZ);

    for (const p of prayers) {
      const timeStr = timings[p];
      if (!timeStr) {
        console.log(`Timing not found for ${p}`);
        continue;
      }
      const [hour, min] = timeStr.split(':');
      const pMoment = moment.tz(`${dateStr} ${hour}:${min}`, 'YYYY-MM-DD HH:mm', TZ);
      console.log(`Scheduling ${p} for:`, pMoment.format(), 'TZ:', TZ);
      if (pMoment.isBefore(now)) {
        console.log(`${p} already passed for today. Skipping schedule.`);
        continue;
      }
      const delayMs = pMoment.diff(now);
      setTimeout(() => {
        sendPrayerNotification(p).catch((e) => console.error(`sendPrayerNotification ${p} error`, e));
      }, delayMs);
    }
  } catch (err) {
    console.error('Failed to schedule prayers:', err.message || err);
  }
}

// sendMaghribNotification() moved to src/fcm/sendMaghrib.ts

async function startScheduler() {
  // Run now and schedule daily interval
  await schedulePrayersForToday();
  // Refresh schedule every 24 hours
  setInterval(() => {
    schedulePrayersForToday().catch((e) => console.error('schedulePrayersForToday error', e));
  }, 24 * 60 * 60 * 1000);
}

startScheduler().catch((e) => console.error('Scheduler failed', e));
