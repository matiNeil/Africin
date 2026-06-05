import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

  if (serviceAccount) {
    try {
      return initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
      });
    } catch (err) {
      console.error("Failed to parse FIREBASE_ADMIN_SERVICE_ACCOUNT — make sure it is the full service account JSON on a single line.", err);
    }
  }

  // Fallback: use project ID from client config
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const adminApp = getAdminApp();

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
