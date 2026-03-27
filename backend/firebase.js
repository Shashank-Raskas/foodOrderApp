import admin from 'firebase-admin';
import fs from 'node:fs/promises';

let serviceAccount;

try {
  // Check if running on Render with FIREBASE_CREDENTIALS env var
  if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    // Local development fallback: load JSON file
    const json = await fs.readFile('./service-account-key.json', 'utf8');
    serviceAccount = JSON.parse(json);
  }
} catch (error) {
  console.error('❌ Failed to load Firebase credentials:', error);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
export default db;
