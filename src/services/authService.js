import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseReady } from '../config/firebase';

let recaptchaVerifier = null;

export const initRecaptcha = (containerId) => {
  if (!isFirebaseReady || !auth) throw new Error('Firebase not configured');
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(
      auth,
      containerId || 'recaptcha-container',
      {
        size: 'invisible',
        callback: () => {},
      }
    );
  }
  return recaptchaVerifier;
};

export const sendOTP = async (phoneNumber) => {
  if (!isFirebaseReady || !auth) throw new Error('Firebase not configured. Use Demo Mode.');
  const verifier = initRecaptcha();
  const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`;
  const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
  return confirmation;
};

export const verifyOTP = async (confirmation, code) => {
  const result = await confirmation.confirm(code);
  return result.user;
};

export const createUserProfile = async (uid, data) => {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

export const getUserProfile = async (uid) => {
  if (!isFirebaseReady || !db || !uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const signOut = async () => {
  await firebaseSignOut(auth);
};
