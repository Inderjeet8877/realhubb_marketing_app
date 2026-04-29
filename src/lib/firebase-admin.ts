import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey && projectId) {
    // Full service account credentials — bypasses all Firestore rules
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    }, 'admin');
  }

  // Fallback: application default credentials (works on GCP / Firebase hosting)
  return initializeApp({ projectId }, 'admin');
}

initAdmin();

export const adminDb = getFirestore(getApps().find(a => a.name === 'admin')!);
