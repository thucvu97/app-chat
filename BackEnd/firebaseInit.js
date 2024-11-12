import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const serviceAccount = JSON.parse(readFileSync('./cert.json'));

const app = initializeApp({
    credential:cert(serviceAccount),
  });
const db = getFirestore(app);
const auth = getAuth(app);
export { db, auth };