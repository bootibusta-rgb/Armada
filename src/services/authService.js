import { Platform } from 'react-native';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, isFirebaseReady } from '../config/firebase';
import { db, doc, setDoc, getDoc } from '../config/firestore';

let recaptchaVerifier = null;
const isWeb = Platform.OS === 'web';

// React Native Firebase - for real phone OTP on native (requires dev build, not Expo Go)
let rnAuthNamespace = null;
if (!isWeb) {
  try {
    rnAuthNamespace = require('@react-native-firebase/auth').default;
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
  if (isFirebaseReady && db) {
    await setDoc(doc(db, 'users', uid), payload);
  }
};

/** Merge-update user profile (for role forms). */
export const updateUserProfile = async (uid, data) => {
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (isFirebaseReady && db) {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
  }
};

export const getUserProfile = async (uid) => {
  if (!uid) return null;
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
