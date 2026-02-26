import admin from 'firebase-admin';

/**
 * Initialize Firebase Admin SDK.
 * Supports two modes:
 * - Provide a path to a service account JSON via env var FIREBASE_SERVICE_ACCOUNT_PATH
 * - Provide the service account JSON string via FIREBASE_SERVICE_ACCOUNT (base64 or raw JSON)
 */
export function initFirebaseAdmin() {
  if (admin.apps.length) return admin.app();

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;

  let serviceAccount: any = undefined;

  if (serviceAccountPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    serviceAccount = require(serviceAccountPath);
  } else if (serviceAccountEnv) {
    try {
      // Allow base64 encoded or raw JSON
      const decoded = Buffer.from(serviceAccountEnv, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    } catch (err) {
      try {
        serviceAccount = JSON.parse(serviceAccountEnv);
      } catch (e) {
        throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT content');
      }
    }
  } else {
    throw new Error('No Firebase service account provided. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin.app();
}

export default admin;
