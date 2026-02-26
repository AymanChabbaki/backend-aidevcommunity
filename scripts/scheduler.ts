import axios from 'axios';
import moment from 'moment-timezone';
import prisma from '../src/lib/prisma';
import { initFirebaseAdmin } from '../src/fcm/firebaseAdmin';
import { sendMaghribNotification } from '../src/fcm/sendMaghrib';

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

async function scheduleMaghribForToday() {
  try {
    const data = await fetchTimingsForToday();
    const timings = data?.timings;
    const dateInfo = data?.date;
    if (!timings || !timings.Maghrib) {
      console.error('Maghrib not found in timings');
      return;
    }

    const maghribStr = timings.Maghrib; // e.g., '18:47'
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
    const [magHour, magMin] = maghribStr.split(':');
    const magMoment = moment.tz(`${dateStr} ${magHour}:${magMin}`, 'YYYY-MM-DD HH:mm', TZ);

    console.log('Scheduling Maghrib for:', magMoment.format(), 'TZ:', TZ);

    const now = moment.tz(TZ);
    if (magMoment.isBefore(now)) {
      console.log('Maghrib already passed for today. Skipping schedule.');
      return;
    }

    const delayMs = magMoment.diff(now);
    setTimeout(() => {
      sendMaghribNotification().catch((e) => console.error('sendMaghribNotification error', e));
    }, delayMs);
  } catch (err) {
    console.error('Failed to schedule maghrib:', err.message || err);
  }
}

// sendMaghribNotification() moved to src/fcm/sendMaghrib.ts

async function startScheduler() {
  // Run now and schedule daily interval
  await scheduleMaghribForToday();
  // Refresh schedule every 24 hours
  setInterval(() => {
    scheduleMaghribForToday().catch((e) => console.error('scheduleMaghribForToday error', e));
  }, 24 * 60 * 60 * 1000);
}

startScheduler().catch((e) => console.error('Scheduler failed', e));
