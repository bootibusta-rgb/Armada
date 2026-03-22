/**
 * Firebase Analytics — web: JS SDK; native: @react-native-firebase/analytics
 */
import { Platform } from 'react-native';
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import { app, isFirebaseReady } from '../config/firebase';

let webAnalytics = null;
let nativeLog = null;
let nativeTried = false;

function sanitizeNativeParams(params = {}) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = String(k).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
    if (typeof v === 'number' && !Number.isNaN(v)) out[key] = v;
    else out[key] = String(v).slice(0, 100);
  }
  return out;
}

function ensureNativeLogger() {
  if (nativeTried) return nativeLog;
  nativeTried = true;
  if (Platform.OS === 'web') return null;
  try {
    const analytics = require('@react-native-firebase/analytics').default;
    nativeLog = (name, params) =>
      analytics()
        .logEvent(name, sanitizeNativeParams(params))
        .catch(() => {});
  } catch {
    nativeLog = null;
  }
  return nativeLog;
}

export async function initAnalytics() {
  if (Platform.OS === 'web') {
    if (!app || !isFirebaseReady) return;
    try {
      const supported = await isSupported();
      if (supported) webAnalytics = getAnalytics(app);
    } catch (e) {
      console.warn('Analytics init failed:', e.message);
    }
    return;
  }
  ensureNativeLogger();
}

export function logAnalyticsEvent(name, params = {}) {
  if (Platform.OS === 'web') {
    if (!webAnalytics) return;
    try {
      logEvent(webAnalytics, name, params);
    } catch (e) {}
    return;
  }
  const log = ensureNativeLogger();
  if (log) log(name, params);
}

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
  screenView: (screenName) => logAnalyticsEvent('screen_view', { screen_name: screenName }),
  paymentStarted: (rideId, method) =>
    logAnalyticsEvent('payment_started', { ride_id: rideId, method }),
};
