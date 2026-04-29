import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp(): App {
  // Return existing app if already initialized
  if (getApps().length > 0) return getApp();

  const projectId  = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID  || '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const privateKey  = rawKey?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  // No credentials yet — init without them so the module loads without crashing.
  // Firestore calls will fail gracefully until credentials are added.
  return initializeApp({ projectId: projectId || 'placeholder' });
}

export const adminDb = getFirestore(getAdminApp());
