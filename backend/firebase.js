import fs from 'node:fs/promises';
import admin from 'firebase-admin';

let serviceAccount;

try {
  const json = await fs.readFile('./service-account-key.json', 'utf8');
  serviceAccount = JSON.parse(json);
} catch (error) {
  console.error('Failed to load Firebase credentials:', error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const db = admin.firestore();
