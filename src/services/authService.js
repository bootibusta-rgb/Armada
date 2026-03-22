import { Platform } from 'react-native';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseReady } from '../config/firebase';

let recaptchaVerifier = null;
const isWeb = Platform.OS === 'web';

// React Native Firebase - for real phone OTP on native (requires dev build, not Expo Go)
// Use modular API (getFirestore, doc, setDoc, getDoc) to avoid deprecation warnings
let rnAuth = null;
let rnFirestoreModular = null;
if (!isWeb) {
  try {
    const rnfAuth = require('@react-native-firebase/auth').default;
    const rnfFirestore = require('@react-native-firebase/firestore');
    rnAuth = rnfAuth;
    rnFirestoreModular = rnfFirestore;
  } catch (e) {
    // RNFB not available (e.g. Expo Go)
  }
}

const useNativeAuth = !isWeb && !!rnAuth;

export const initRecaptcha = (containerId) => {
  if (!isWeb) return null;
  if (!isFirebaseReady || !auth) throw new Error('Firebase not configured');
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(
      auth,
      containerId || 'recaptcha-container',
      { size: 'invisible', callback: () => {} }
    );
  }
  return recaptchaVerifier;
};

export const sendOTP = async (phoneNumber) => {
  if (useNativeAuth) {
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`;
    return rnAuth().signInWithPhoneNumber(formattedPhone);
  }
  if (!isFirebaseReady || !auth) throw new Error('Firebase not configured. Use Demo Mode.');
  if (!isWeb) throw new Error('Phone OTP requires a development build. Use Expo Go? Try Demo Mode.');
  const verifier = initRecaptcha();
  const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`;
  return signInWithPhoneNumber(auth, formattedPhone, verifier);
};

export const verifyOTP = async (confirmation, code) => {
  const result = await confirmation.confirm(code);
  return result.user;
};

export const createUserProfile = async (uid, data) => {
  const payload = {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (useNativeAuth && rnFirestoreModular) {
    const { getFirestore, doc, setDoc } = rnFirestoreModular;
    const rnDb = getFirestore();
    await setDoc(doc(rnDb, 'users', uid), payload);
  } else if (isFirebaseReady && db) {
    await setDoc(doc(db, 'users', uid), payload);
  }
};

/** Merge-update user profile (for role forms). Works with both RNFB and firebase JS. */
export const updateUserProfile = async (uid, data) => {
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (useNativeAuth && rnFirestoreModular) {
    const { getFirestore, doc, setDoc } = rnFirestoreModular;
    const rnDb = getFirestore();
    await setDoc(doc(rnDb, 'users', uid), payload, { merge: true });
  } else if (isFirebaseReady && db) {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
  }
};

export const getUserProfile = async (uid) => {
  if (!uid) return null;
  if (useNativeAuth && rnFirestoreModular) {
    const { getFirestore, doc, getDoc } = rnFirestoreModular;
    const rnDb = getFirestore();
    const snap = await getDoc(doc(rnDb, 'users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  if (!isFirebaseReady || !db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const signOut = async () => {
  if (useNativeAuth && rnAuth) {
    await rnAuth().signOut();
    // Also sign out from Firebase JS SDK (we synced auth via custom token)
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {}
    }
  } else if (auth) {
    await firebaseSignOut(auth);
  }
};

export { useNativeAuth };
