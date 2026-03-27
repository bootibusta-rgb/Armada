import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { attachFirestore } from './firestore';

// Config from env (EXPO_PUBLIC_*). Copy .env.example to .env and fill values.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'YOUR_APP_ID',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
};

const isConfigValid =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes('YOUR_') &&
  !firebaseConfig.projectId.includes('YOUR_');

let app = null;
let auth = null;
let realtimeDb = null;
let functions = null;
let storage = null;

if (isConfigValid) {
  try {
    app = initializeApp(firebaseConfig);
    if (Platform.OS !== 'web') {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      });
    } else {
      auth = getAuth(app);
    }
    attachFirestore(app);
    realtimeDb = getDatabase(app);
    functions = getFunctions(app);
    storage = getStorage(app);
  } catch (e) {
    if (e?.code === 'auth/already-initialized') {
      auth = getAuth(app);
      attachFirestore(app);
    } else {
      console.warn('Firebase init failed:', e?.message);
    }
  }
}

export { app, auth, realtimeDb, functions, storage };
export { db } from './firestore';
export const isFirebaseReady = !!auth;
