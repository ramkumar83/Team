/**
 * Firebase project configuration.
 *
 * This is NOT a secret — Firebase web app config (apiKey, authDomain, etc.)
 * is designed to be public and shipped in client-side code; it only
 * identifies which Firebase project to talk to. Actual security comes from
 * the Firestore Security Rules and Authentication setup you configure in
 * the Firebase console (see README.md).
 *
 * To fill this in:
 *   1. Go to https://console.firebase.google.com and create a free project.
 *   2. Project settings (gear icon) → General → "Your apps" → Add app → Web (</>).
 *   3. Copy the firebaseConfig object it gives you and paste the values below.
 *
 * Until you do this, the app runs with placeholder values and Firebase
 * calls will fail — see README.md for the full setup checklist.
 */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
