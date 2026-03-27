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
let rnAuthNamespace = null;
let rnFirestoreModular = null;
if (!isWeb) {
  try {
    rnAuthNamespace = require('@react-native-firebase/auth').default;
    const rnfFirestore = require('@react-native-firebase/firestore');
    rnFirestoreModular = rnfFirestore;
  } catch (e) {
    // RNFB not available (e.g. Expo Go)
  }
}

const useNativeAuth = !isWeb && !!rnAuthNamespace;

/** Phone confirmation objects are not serializable — keep them off navigation params. */
let pendingPhoneConfirmation = null;

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
  const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`;
  if (useNativeAuth) {
    const { getAuth, signInWithPhoneNumber: modularSignIn } = require('@react-native-firebase/auth');
    pendingPhoneConfirmation = await modularSignIn(getAuth(), formattedPhone);
    return;
  }
  if (!isFirebaseReady || !auth) throw new Error('Firebase not configured. Use Demo Mode.');
  if (!isWeb) throw new Error('Phone OTP requires a development build. Use Expo Go? Try Demo Mode.');
  const verifier = initRecaptcha();
  pendingPhoneConfirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
};

export const verifyOTP = async (code) => {
  if (!pendingPhoneConfirmation) {
    throw new Error('No pending verification. Go back and request a new code.');
  }
  const result = await pendingPhoneConfirmation.confirm(code);
  pendingPhoneConfirmation = null;
  return result?.user != null ? result.user : result;
};

/** Call on sign-out so stale confirmations cannot be verified later. */
export const clearPendingPhoneAuth = () => {
  pendingPhoneConfirmation = null;
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

/**
 * Resolves Firebase UID when React context lags right after OTP (native) or on web.
 */
export function getCurrentAuthUid(contextUser) {
  if (contextUser?.uid) return contextUser.uid;
  if (useNativeAuth) {
    try {
      const { getAuth } = require('@react-native-firebase/auth');
      return getAuth().currentUser?.uid ?? null;
    } catch (e) {
      /* ignore */
    }
  }
  if (isFirebaseReady && auth?.currentUser?.uid) return auth.currentUser.uid;
  return null;
}

export const signOut = async () => {
  clearPendingPhoneAuth();
  if (useNativeAuth) {
    const { getAuth, signOut: modularSignOut } = require('@react-native-firebase/auth');
    await modularSignOut(getAuth());
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
