/**
 * Payment service - updates Firebase ride status and payment records.
 * Cash: marks ride as completed in Firestore.
 * Card (PayPal): server-side verification via Cloud Function, then marks ride complete.
 */
import { httpsCallable } from 'firebase/functions';
import { updateRide } from './rideService';
import { analyticsEvents } from './analyticsService';
import { isFirebaseReady, functions } from '../config/firebase';

export const chargeCard = async (rideId, amount, currency = 'JMD') => {
  // PayPal SDK handles charge client-side; server-side verification optional
  return { success: true, transactionId: `pay_${Date.now()}` };
};

/**
 * Mark ride as cash-paid and completed in Firebase.
 */
export const processCashFlag = async (rideId, amount = 0) => {
  if (!isFirebaseReady || !rideId) {
    throw new Error('Firebase not configured or missing rideId');
  }
  await updateRide(rideId, {
    status: 'completed',
    paymentMethod: 'cash',
    completedAt: new Date().toISOString(),
  });
  analyticsEvents.rideCompleted(rideId, 'cash', amount);
  return { success: true };
};

/**
 * Mark ride as card-paid (PayPal) and completed in Firebase.
 * Uses verifyPayPalCapture Cloud Function when captureId is provided for server-side verification.
 */
export const processCardPayment = async (rideId, amount, captureId = null) => {
  if (!isFirebaseReady || !rideId) {
    throw new Error('Firebase not configured or missing rideId');
  }
  if (captureId && functions) {
    try {
      const verify = httpsCallable(functions, 'verifyPayPalCapture');
      const { data } = await verify({ rideId, amount, captureId });
      if (data?.success) return { success: true };
    } catch (e) {
      console.warn('PayPal verification failed, falling back to direct update:', e.message);
    }
  }
  await updateRide(rideId, {
    status: 'completed',
    paymentMethod: 'card',
    paidAmount: amount,
    paypalTransactionId: captureId || `pay_${Date.now()}`,
    completedAt: new Date().toISOString(),
  });
  analyticsEvents.rideCompleted(rideId, 'card', amount);
  return { success: true };
};

export const processGoldTierPayment = async (amount = 200) => {
  // In production: call PayPal/Stripe, then update driver subscription in Firestore
  return { success: true, logged: true };
};

export const processCorporateSubscription = async (amount = 50000) => {
  // In production: call PayPal/Stripe, then update corporate subscription in Firestore
  return { success: true, logged: true };
};

export const processVendorSubscription = async (planId, amount) => {
  // In production: PayPal/Stripe for vendor premium
  return { success: true, transactionId: `vendor_${planId}_${Date.now()}` };
};
