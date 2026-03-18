/**
 * Firebase Analytics - log key events for ride flow, bids, payments.
 * Web only: Firebase Analytics uses document/IndexedDB/cookies, which don't exist in React Native.
 * Uses isSupported() to avoid "getElementsByTagName of undefined" crash in Expo Go / React Native.
 */
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import { app, isFirebaseReady } from '../config/firebase';

let analytics = null;

export async function initAnalytics() {
  if (!app || !isFirebaseReady) return;
  try {
    const supported = await isSupported();
    if (supported) {
      analytics = getAnalytics(app);
    }
  } catch (e) {
    console.warn('Analytics init failed:', e.message);
  }
}

export function logAnalyticsEvent(name, params = {}) {
  if (!analytics) return;
  try {
    logEvent(analytics, name, params);
  } catch (e) {}
}

// Key events
export const analyticsEvents = {
  rideRequested: (rideId, bidPrice) =>
    logAnalyticsEvent('ride_requested', { ride_id: rideId, bid_price: bidPrice }),
  bidAdded: (rideId, driverId, price) =>
    logAnalyticsEvent('bid_added', { ride_id: rideId, driver_id: driverId, price }),
  rideAccepted: (rideId, driverId, fare) =>
    logAnalyticsEvent('ride_accepted', { ride_id: rideId, driver_id: driverId, fare }),
  rideCompleted: (rideId, paymentMethod, amount) =>
    logAnalyticsEvent('ride_completed', { ride_id: rideId, payment_method: paymentMethod, amount }),
  driverRated: (rideId, driverId, rating) =>
    logAnalyticsEvent('driver_rated', { ride_id: rideId, driver_id: driverId, rating }),
  rideCancelled: (rideId, reason, cancelledBy) =>
    logAnalyticsEvent('ride_cancelled', { ride_id: rideId, reason, cancelled_by: cancelledBy }),
  screenView: (screenName) =>
    logAnalyticsEvent('screen_view', { screen_name: screenName }),
  paymentStarted: (rideId, method) =>
    logAnalyticsEvent('payment_started', { ride_id: rideId, method }),
};
