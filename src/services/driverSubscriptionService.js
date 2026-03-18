import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

export const DRIVER_DAILY_FEE = 1000;       // JMD per 24 hours
export const REFERRAL_FIRST_DAY_FEE = 500; // 50% off for referred drivers
export const FREE_FIRST_DAY_HOURS = 24;

export const getDriverSubscription = async (driverId) => {
  if (!isFirebaseReady || !db || !driverId) return null;
  const snap = await getDoc(doc(db, 'users', driverId));
  const data = snap.data();
  return data?.driverSubscription || null;
};

export const isFirstDayFree = (driverProfile) => {
  const createdAt = driverProfile?.createdAt || driverProfile?.signedUpAt;
  if (!createdAt) return true; // Assume first day if no date
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const now = new Date();
  const hoursSince = (now - created) / (1000 * 60 * 60);
  return hoursSince < FREE_FIRST_DAY_HOURS;
};

export const isSubscriptionActive = (subscription, driverProfile) => {
  if (isFirstDayFree(driverProfile)) return true;
  if (!subscription?.expiresAt) return false;
  const expires = subscription.expiresAt?.toDate?.() || new Date(subscription.expiresAt);
  return new Date() < expires;
};

export const hasCompletedFirstPayment = (driverProfile) => {
  return !!(driverProfile?.driverSubscription?.firstPaymentAt || driverProfile?.firstPaymentCompleted);
};

export const getReferralCode = (driverId) => {
  return `armada-driver-${driverId}`;
};

export const payDriverSubscription = async (driverId, amount, referredBy = null) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const userRef = doc(db, 'users', driverId);
  const snap = await getDoc(userRef);
  const sub = snap.data()?.driverSubscription || {};
  const now = new Date();
  const expiresAt = Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  await updateDoc(userRef, {
    driverSubscription: {
      ...sub,
      expiresAt,
      amount,
      lastPaymentAt: now.toISOString(),
      firstPaymentAt: sub.firstPaymentAt || now.toISOString(),
      referredBy: referredBy || sub.referredBy,
    },
    firstPaymentCompleted: true,
    updatedAt: serverTimestamp(),
  });
};
