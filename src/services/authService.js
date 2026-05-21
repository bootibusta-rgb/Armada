import { Platform } from 'react-native';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, isFirebaseReady } from '../config/firebase';
import { db, doc, setDoc, getDoc, docSnapExists, updateDoc } from '../config/firestore';
import { isReactNativeFirebaseNativeAvailable } from '../utils/nativeFirebase';
import { shouldForceAndroidRecaptchaForPhone } from '../config/androidPhoneAuthPolicy';
import { getPhoneAuthInstallWarning } from '../constants/phoneAuthReleaseGate';
import { getNativeAppBuildLabel } from '../constants/nativeAppBuildLabel';

let recaptchaVerifier = null;
const isWeb = Platform.OS === 'web';

// React Native Firebase — only after native module is linked (dev/production build, not Expo Go)
let rnAuthNamespace = null;
if (!isWeb && isReactNativeFirebaseNativeAvailable()) {
  try {
    rnAuthNamespace = require('@react-native-firebase/auth').default;
  } catch (e) {
    rnAuthNamespace = null;
  }
}

const useNativeAuth = !isWeb && !!rnAuthNamespace;

/**
 * Android: sync `forceRecaptchaFlowForTesting` with {@link shouldForceAndroidRecaptchaForPhone} before each OTP send.
 * Default is off (Play Integrity + SHA-1/256 in Firebase). Only set EXPO_PUBLIC_FIREBASE_ANDROID_PHONE_USE_RECAPTCHA=true
 * if reCAPTCHA Enterprise is configured; otherwise you get auth/missing-client-identifier.
 */
function applyAndroidPhoneAuthWorkaround() {
  if (isWeb || !useNativeAuth || Platform.OS !== 'android') {
    return;
  }
  try {
    const { applyAndroidForceRecaptchaPhoneFlow } = require('../config/earlyAndroidFirebaseAuth');
    applyAndroidForceRecaptchaPhoneFlow();
  } catch (e) {
    console.warn('[auth] Android phone reCAPTCHA workaround failed:', e?.message || e);
  }
}

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

function formatPhoneE164(phoneNumber) {
  const raw = String(phoneNumber || '').replace(/[\s\u00a0]/g, '').trim();
  if (raw.startsWith('+')) return raw;
  return `+1${raw.replace(/^\+?1?/, '')}`;
}

/**
 * Android: retry only safe `auth/unknown` cases (e.g. flaky Play Integrity on some Samsung builds).
 * Never retry rate limits, missing app identifier, or GCP-blocked client errors.
 */
function androidPhoneUnknownRetryable(error) {
  if (Platform.OS !== 'android' || !error) return false;
  if (error.code === 'auth/too-many-requests') return false;
  if (isLikelySmsQuotaOrRateLimit(error)) return false;
  if (error.code !== 'auth/unknown') return false;
  const blob = (
    `${error?.message || ''} ${error?.nativeErrorMessage || ''} ${error?.userInfo?.message || ''} ` +
    `${typeof error?.toString === 'function' ? error.toString() : ''}`
  ).toLowerCase();
  if (/android\s+client\s+application/.test(blob) && /\bblocked\b/.test(blob)) return false;
  if (/missing.*identifier|missing a valid app|invalid.*app/i.test(blob)) return false;
  return true;
}

const delayMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sendOTP = async (phoneNumber) => {
  const formattedPhone = formatPhoneE164(phoneNumber);
  if (useNativeAuth) {
    clearPendingPhoneAuth();
    const { getNativeAuth } = require('../config/rnFirebaseAuth');
    const maxAttempts = Platform.OS === 'android' ? 3 : 1;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      applyAndroidPhoneAuthWorkaround();
      const authInstance = getNativeAuth();
      try {
        if (authInstance && typeof authInstance.setLanguageCode === 'function') {
          authInstance.setLanguageCode('en');
        }
      } catch (_) {}
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[auth] signInWithPhoneNumber attempt', attempt, '→', formattedPhone);
      }
      try {
        // Instance API matches RNFB docs for Activity/reCAPTCHA fallback on Samsung when modular path flakes.
        // eslint-disable-next-line no-await-in-loop
        pendingPhoneConfirmation = await authInstance.signInWithPhoneNumber(formattedPhone);
        return;
      } catch (e) {
        lastErr = e;
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[auth] sendOTP failed attempt', attempt, e?.code, e?.message);
        } else if (Platform.OS === 'android') {
          // eslint-disable-next-line no-console
          console.warn('[auth] sendOTP android', attempt, e?.code, e?.message || e?.nativeErrorMessage);
        }
        const retry = attempt < maxAttempts && androidPhoneUnknownRetryable(e);
        if (!retry) {
          throw e;
        }
        const backoff = 3000 + attempt * 1200 + Math.floor(Math.random() * 1000);
        // eslint-disable-next-line no-await-in-loop
        await delayMs(backoff);
      }
    }
    throw lastErr;
  }
  if (!isFirebaseReady || !auth) throw new Error('Sign-in is unavailable. Please try again later.');
  if (!isWeb) throw new Error('Install the Armada app to sign in with your phone.');
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
  if (useNativeAuth && isFirebaseReady) {
    try {
      const { ensureFirebaseJsAuthForCallables } = require('../utils/ensureFirebaseJsAuthForCallables');
      await ensureFirebaseJsAuthForCallables();
    } catch (e) {
      throw new Error(e?.message || 'Sign-in sync failed. Open the app again or sign out and back in.');
    }
  }
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (isFirebaseReady && db) {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
  }
};

/** Clears the one-time “subscription clock started” flag on `driverSubscription`. */
export const clearDriverSubscriptionStartAck = async (uid) => {
  if (useNativeAuth && isFirebaseReady) {
    try {
      const { ensureFirebaseJsAuthForCallables } = require('../utils/ensureFirebaseJsAuthForCallables');
      await ensureFirebaseJsAuthForCallables();
    } catch (e) {
      throw new Error(e?.message || 'Sign-in sync failed. Open the app again or sign out and back in.');
    }
  }
  if (isFirebaseReady && db && uid) {
    await updateDoc(doc(db, 'users', uid), {
      'driverSubscription.needsSubscriptionStartAck': false,
      updatedAt: new Date().toISOString(),
    });
  }
};

export const getUserProfile = async (uid) => {
  if (!uid) return null;
  if (!isFirebaseReady || !db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!docSnapExists(snap)) return null;
  // Document id must stay the Firebase UID (rules use request.auth.uid). A stored `id` in data must not override.
  return { ...snap.data(), id: snap.id };
};

/**
 * Account roles as a string array (for switching tabs, settings, writes). Malformed `roles`
 * in Firestore (object, string, etc.) would otherwise make `roles.includes(...)` throw on dashboard mount.
 */
export function roleListFromProfile(profile) {
  if (!profile) return [];
  const raw = profile.roles;
  if (Array.isArray(raw)) {
    const out = [];
    for (const r of raw) {
      if (typeof r === 'string') {
        const t = r.trim();
        if (t) out.push(t);
      }
    }
    if (out.length) return out;
  }
  if (typeof raw === 'string') {
    const parts = raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts;
  }
  if (typeof profile.role === 'string') {
    const t = profile.role.trim();
    if (t) return [t];
  }
  return [];
}

/**
 * Safe UI string from a Firestore user field (name, vendorName, etc.) — values may be numbers or other types.
 */
export function profileDisplayString(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const t = value.trim();
    return t || fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? String(value) : fallback;
  try {
    const s = String(value);
    if (s === '[object Object]') return fallback;
    const t = s.trim();
    return t || fallback;
  } catch {
    return fallback;
  }
}

/**
 * True if the user may use the in-app admin dashboard.
 * Only `users/{uid}.admin` on the profile document (Firestore matches this in `isAdmin()` rules).
 * Accepts boolean true or common Console mistakes (number 1, strings "true"/"1"/"yes").
 */
export function isProfileAdmin(profile) {
  if (!profile) return false;
  const a = profile.admin;
  if (a === true || a === 1) return true;
  if (typeof a === 'string') {
    const s = a.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
  }
  return false;
}

/**
 * Resolves Firebase UID when React context lags right after OTP (native) or on web.
 */
export function getCurrentAuthUid(contextUser) {
  if (contextUser?.uid) return contextUser.uid;
  if (useNativeAuth) {
    try {
      const { getNativeAuth } = require('../config/rnFirebaseAuth');
      return getNativeAuth().currentUser?.uid ?? null;
    } catch (e) {
      /* ignore */
    }
  }
  if (isFirebaseReady && auth?.currentUser?.uid) return auth.currentUser.uid;
  return null;
}

/**
 * Same UID the app uses when writing `rides.riderId` ({@link RiderHomeScreen} uses this fallback).
 * Use for counters / accept so Firestore rules match the stored rider.
 */
export function resolveAuthUid(contextUser, profile) {
  return getCurrentAuthUid(contextUser) || profile?.id || null;
}

/**
 * Firebase phone auth on native Android fails with auth/missing-client-identifier when
 * Play Integrity / reCAPTCHA cannot tie the APK to the Firebase Android app — almost
 * always missing or wrong SHA-1/SHA-256 in Firebase Console for the keystore that signed the build.
 * This can surface when sending the SMS or when verifying the code (confirm/OTP step).
 */
function getPhoneAuthErrorBlob(error) {
  let json = '';
  try {
    json = JSON.stringify(error);
  } catch {
    json = '';
  }
  return (
    `${json} ${error?.code || ''} ${error?.message || ''} ${error?.nativeErrorMessage || ''} ` +
    `${error?.userInfo?.message || ''} ${error?.userInfo?.code ?? ''} ${typeof error?.toString === 'function' ? error.toString() : ''}`
  );
}

/**
 * Firebase surfaces throttling as auth/too-many-requests or auth/unknown with varied wording.
 * Be permissive so users see the cooldown message instead of generic retry guidance.
 */
function isLikelySmsQuotaOrRateLimit(error) {
  if (!error) return false;
  if (error.code === 'auth/too-many-requests') return true;
  const b = getPhoneAuthErrorBlob(error).toLowerCase();
  return (
    /too[-\s]?many|many attempts|too many verifications|verification attempts|exceeded.*(attempt|try|request)|maximum.*attempt|temporarily (blocked|disabled|locked|unavailable)|has been blocked|blocked all|blocked.*request|from this device|for this device|unusual activity|abuse detection|\babuse\b|try again (later|in|after|tomorrow)|please wait|retry after|wait (before|\d)|hours before|several hours|\b24[\s-]*hours?\b|sms.*(limit|quota|thrott)|rate[-\s]?limit|resource_exhausted|quota exceeded|flood|denied for reuse|cannot.*request|requests from this device/.test(
      b,
    )
  );
}

/** Firebase surfaces "Error code:39" inside auth/unknown for several backend failures (rate limits, carrier, integrity). */
function isFirebasePhoneError39(error) {
  if (!error || error?.code !== 'auth/unknown') return false;
  const blob = getPhoneAuthErrorBlob(error);
  return (
    /\b(?:error\s*)?code\s*[:=]\s*39\b/i.test(blob) ||
    /\[\s*Error\s+code\s*:\s*39\s*\]/i.test(blob) ||
    (/internal\s+error/i.test(blob) && /\b39\b/.test(blob))
  );
}

/**
 * Strong hint that Google's app/device attestation rejected the OTP send (distinct from SMS quota).
 * Test phone numbers bypass this — real SIMs trigger Play Integrity tied to APK signing certs in Firebase.
 */
function suggestsIntegrityOrAttestationFailure(error) {
  if (!error || error?.code !== 'auth/unknown') return false;
  const b = getPhoneAuthErrorBlob(error).toLowerCase();
  return /play\s*integrity|playintegrity|safetynet|recaptcha\.enterprise|verification\s*failed\s*unexpectedly|app\s*attestation/i.test(
    b
  );
}

/**
 * GCP returns auth/unknown with "Requests from this Android client application … are blocked" when
 * an API key used by Firebase Auth is **Application-restricted** in a way that blocks Identity Toolkit
 * (e.g. Android-only key missing the right SHA/package, or web/reCAPTCHA traffic blocked). Less often:
 * Firebase App Check enforcement without a registered provider.
 */
function suggestsGcpBlockedAndroidClient(error) {
  const b = getPhoneAuthErrorBlob(error).toLowerCase();
  return /android\s+client\s+application/.test(b) && /\bblocked\b/.test(b);
}

const GCP_BLOCKED_PHONE_AUTH_USER_MSG =
  'Google blocked phone sign-in for this Android app (server-side configuration—not your phone number).';

const GCP_BLOCKED_PHONE_AUTH_DETAIL_MSG =
  'In Google Cloud Console (same project as Firebase): APIs & Services → Credentials → each API key used by Firebase (often the Android `current_key` in google-services.json). Application restrictions: temporarily **None** to verify, or for Android restriction add package **com.armada.ride** + SHA-1/256 of the keystore that **signed this build** (Studio debug differs from Play). API restrictions must allow Identity Toolkit / Firebase Auth. Firebase Console → App Check: if Authentication is enforced, configure Play Integrity (and debug token for dev) or disable enforcement until done.';

const RATE_LIMIT_SMS_MSG =
  'Google has temporarily limited SMS sign-in for this number or device (often after repeated tries). Cooldowns often last many hours and can exceed 24 hours; waiting one hour does not guarantee it has reset.\n\n' +
  'Do not keep tapping Send or Resend — extra attempts can extend the block. When you try again, switch between Wi‑Fi and mobile data, wait several hours between tries, or use a different phone number if possible.';

const PHONE_ALREADY_IN_FIREBASE_NOTE =
  'If this number already appears in Firebase Authentication, that is normal — sign-in still sends an SMS to that number. (auth/unknown) is not caused by an existing account.';

const ERROR_39_GENERIC_MSG =
  "We couldn't verify your phone right now. Update Google Play services, check your connection, wait several minutes between attempts, and try switching between Wi‑Fi and mobile data.";

const PHONE_AUTH_STALE_APK_HINT =
  'If “Store build” on the sign-in screen is much older than the latest Armada in the Play Store, update or reinstall first—old APKs often fail phone verification even with a good connection.';

const ERROR_39_HELP_USER_MSG =
  'If you use the Play Store or a tester link: update Google Play services, install the latest Armada build, and wait 15+ minutes between tries. Switching Wi‑Fi alone often does not fix app verification failures. Use Email under Safety and send us the (auth/…) code at the bottom of this message.';

const ERROR_39_HELP_DEV_MSG =
  'Dev: Firebase error 39 is often Play Integrity + missing certs. Add Play App Signing SHA-1 and upload-key SHA-1 for com.armada.ride → download google-services.json → rebuild. See FIREBASE_SHA_FINGERPRINTS.md.';

function phoneAuthNativeDetail(error) {
  const bits = [
    error?.nativeErrorMessage,
    error?.userInfo?.message,
    error?.userInfo?.code != null ? `nativeCode:${error.userInfo.code}` : null,
  ].filter(Boolean);
  const joined = bits.join(' · ').trim();
  return joined.length > 320 ? `${joined.slice(0, 317)}…` : joined;
}

function phoneAuthSupportChunks() {
  const installWarn = getPhoneAuthInstallWarning();
  const chunks = [
    `Installed build: ${getNativeAppBuildLabel()}`,
    PHONE_ALREADY_IN_FIREBASE_NOTE,
  ];
  if (installWarn) chunks.unshift(installWarn);
  return chunks;
}

export function getPhoneAuthErrorMessage(error) {
  const code = error?.code || '';
  const raw = (error?.message || '').trim();

  /** Rate limits / quotas often arrive as auth/too-many-requests or disguised auth/unknown — handle before fingerprint advice. */
  if (
    code === 'auth/too-many-requests' ||
    (isLikelySmsQuotaOrRateLimit(error) && code !== 'auth/missing-client-identifier')
  ) {
    const devHint = __DEV__
      ? '\n\n[Dev] Firebase Console → Authentication → Sign-in method → Phone numbers for testing (fixed OTP, no SMS).'
      : '';
    return RATE_LIMIT_SMS_MSG + devHint;
  }
  if (suggestsGcpBlockedAndroidClient(error)) {
    const parts = [GCP_BLOCKED_PHONE_AUTH_USER_MSG, GCP_BLOCKED_PHONE_AUTH_DETAIL_MSG];
    if (__DEV__) {
      parts.push(
        `[dev] ${error?.code || ''} ${String(error?.message || '').slice(0, 280)}`,
      );
    }
    return parts.join('\n\n');
  }
  if (
    code === 'auth/missing-client-identifier' ||
    raw.includes('missing a valid app identifier')
  ) {
    if (isWeb) {
      return raw || 'Phone sign-in verification failed. Check Firebase web app config and authorized domains.';
    }
    if (!isWeb && Platform.OS === 'android') {
      if (shouldForceAndroidRecaptchaForPhone()) {
        return 'Phone verification could not finish. Update the app from the Play Store (or your test link), then try again.';
      }
      return (
        'Sign-in could not verify this app safely. Install Armada from the Play Store (or your official test link), reinstall after updating Google Play services, then try again.'
      );
    }
    return (
      'Firebase could not verify this app. For iOS, confirm the bundle ID matches Firebase and phone sign-in is enabled. ' +
      (raw || '')
    );
  }
  if (code === 'auth/invalid-phone-number' || raw.toLowerCase().includes('invalid phone')) {
    return 'Invalid phone number. Use E.164 format (e.g. +18761234567 for Jamaica).';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phone sign-in is unavailable for this app right now. Try again later or contact support.';
  }
  if (code === 'auth/invalid-verification-code' || code === 'auth/missing-verification-code') {
    return 'That code is wrong or expired. Request a new SMS and try again.';
  }
  if (code === 'auth/session-expired' || code === 'auth/code-expired') {
    return 'The SMS code expired. Go back and request a new code.';
  }
  if (
    code === 'auth/unknown' &&
    (isFirebasePhoneError39(error) || suggestsIntegrityOrAttestationFailure(error)) &&
    !isLikelySmsQuotaOrRateLimit(error)
  ) {
    const chunks = [
      ...phoneAuthSupportChunks(),
      ERROR_39_GENERIC_MSG,
      PHONE_AUTH_STALE_APK_HINT,
      ERROR_39_HELP_USER_MSG,
      __DEV__ ? ERROR_39_HELP_DEV_MSG : null,
      __DEV__
        ? `[dev detail] ${(error?.code || '')} ${String(error?.message || '').slice(0, 260)}`.trim()
        : null,
    ].filter(Boolean);
    return chunks.join('\n\n');
  }
  if (
    code === 'auth/unknown' &&
    !isWeb &&
    Platform.OS === 'android' &&
    /internal\s+error/i.test(raw)
  ) {
    return [...phoneAuthSupportChunks(), "We couldn't reach Google's sign-in service. Check your connection and try again in a few minutes."].join(
      '\n\n',
    );
  }
  if (code === 'auth/unknown' && !isWeb && Platform.OS === 'android' && !isLikelySmsQuotaOrRateLimit(error)) {
    const chunks = [
      ...phoneAuthSupportChunks(),
      ERROR_39_GENERIC_MSG,
      PHONE_AUTH_STALE_APK_HINT,
      ERROR_39_HELP_USER_MSG,
      __DEV__ ? ERROR_39_HELP_DEV_MSG : null,
      __DEV__ ? `[dev detail] ${(error?.code || '')} ${String(raw).slice(0, 260)}`.trim() : null,
    ].filter(Boolean);
    return chunks.join('\n\n');
  }
  return raw || 'Phone sign-in failed. Try again.';
}

/** Alert body for phone flows: friendly text plus Firebase `error.code` in release (for support / Play Integrity diagnosis). */
export function phoneAuthAlertMessage(error, fallback) {
  const body = getPhoneAuthErrorMessage(error) || fallback || '';
  const code = error && typeof error.code === 'string' ? error.code.trim() : '';
  const native = phoneAuthNativeDetail(error);
  const playIntegrityHint =
    !isWeb && Platform.OS === 'android' && code === 'auth/unknown'
      ? 'If this persists on a Play-installed build: Play Console → App integrity → Play Integrity API → Link Google Cloud project (armada-25d8a), enable Play Integrity API in GCP, wait 24h, then reinstall from Play.'
      : '';
  const parts = [body];
  if (playIntegrityHint) parts.push(playIntegrityHint);
  if (native) parts.push(`Technical: ${native}`);
  if (code && !body.includes(`(${code})`)) parts.push(`(${code})`);
  return parts.filter(Boolean).join('\n\n');
}

export const signOut = async () => {
  clearPendingPhoneAuth();
  if (useNativeAuth) {
    const { signOut: modularSignOut } = require('@react-native-firebase/auth');
    const { getNativeAuth } = require('../config/rnFirebaseAuth');
    await modularSignOut(getNativeAuth());
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
