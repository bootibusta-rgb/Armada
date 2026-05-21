/**
 * Push notification service - registers token and handles incoming notifications.
 *
 * Expected notification payloads (from backend / Cloud Functions / Expo push API):
 *
 * 1) Driver ETA (rider)
 *    title: "Driver is about 3 min away"
 *    body:  "Marcus is heading to your pickup."
 *    data:  { type: 'driver_eta', rideId: '<id>', minutes: 3 }
 *
 * 2) Driver at pickup (rider)
 *    title: "Driver has arrived"
 *    body:  "Your driver is at the pickup point."
 *    data:  { type: 'driver_at_pickup', rideId: '<id>' }
 *
 * 3) Rider coin redeem (driver)
 *    title: "Fare update"
 *    body:  "Rider applied Armada Coins on this ride (J$100 off)."
 *    data:  { type: 'rider_coin_redeem', rideId: '<id>' }
 *
 * 4) Ride cancelled + receipt deep link
 *    data:  { type: 'cancelled', rideId: '<id>' }
 *
 * 5) Vendor new order (push from functions)
 *    data:  { type: 'food_order', orderId: '<id>', rideId: '...' }
 *
 * 6) Food ready for pickup (rider) — vendor sets order status to `ready`
 *    data:  { type: 'food_ready', rideId: '<id>', orderId: '<id>' }
 *
 * 7) New driver bid (rider)
 *    data:  { type: 'bid', rideId: '<id>' }
 *
 * 7b) Rider counter on existing bid thread (driver)
 *    data:  { type: 'rider_counter', rideId: '<id>' }
 *
 * 8) Ride accepted (rider)
 *    data:  { type: 'accepted', rideId: '<id>' }
 *
 * 9) Driver ETA (rider) — callable notifyDriverApproaching
 *    data:  { type: 'approaching', rideId: '<id>', etaMinutes: 3 }
 *
 * Cold start: tap uses getLastNotificationResponseAsync + pending queue (see RootNavigator + App.js).
 * Universal links / scheme: armada://home/ride/:rideId/receipt | bidding | active
 *
 * Remote push JSON (Expo) example:
 *    { "to": "<ExpoPushToken>", "sound": "default", "title": "...", "body": "...", "data": { ... } }
 *
 * Android 8+ requires a notification channel for sound/vibration — see ensureArmadaAndroidNotificationChannel().
 *
 * Note: Push notifications were removed from Expo Go in SDK 53. Use a dev build to test.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc, db } from '../config/firestore';
import { isFirebaseReady } from '../config/firebase';

const isExpoGo = Constants.appOwnership === 'expo';

/** Android channel id — use the same in FCM `channelId` if you send data messages. */
export const ARMADA_ANDROID_NOTIFICATION_CHANNEL_ID = 'armada-alerts';

let androidChannelEnsured = false;

export async function ensureArmadaAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;
  if (androidChannelEnsured) return;
  await Notifications.setNotificationChannelAsync(ARMADA_ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: 'Armada alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
  });
  androidChannelEnsured = true;
}

function androidLocalNotificationContentPatch() {
  if (Platform.OS !== 'android') return {};
  return {
    android: {
      channelId: ARMADA_ANDROID_NOTIFICATION_CHANNEL_ID,
    },
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority?.HIGH,
  }),
});

/** Expo push tokens require the EAS project UUID — not Firebase `project_id` (armada-25d8a). */
export function resolveExpoPushProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    null
  );
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  if (isExpoGo) return null;
  await ensureArmadaAndroidNotificationChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
  }
  const projectId = resolveExpoPushProjectId();
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        '[push] Missing EAS project id — set extra.eas.projectId in app.config or EXPO_PUBLIC_EAS_PROJECT_ID',
      );
    }
    return null;
  }
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (e) {
    if (__DEV__) {
      console.warn('[push] getExpoPushTokenAsync failed:', e?.message || e);
    }
    return null;
  }
}

export async function savePushToken(userId, token) {
  if (!isFirebaseReady || !db || !userId || !token) return;
  try {
    await updateDoc(doc(db, 'users', userId), {
      pushToken: token,
      pushTokenUpdatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Could not save push token:', e.message);
  }
}

export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/** Immediate local alert when a new bidding ride includes split fare (driver app, dev build). */
/** In-app alert when vendor’s Firestore listener sees a new open order (complements remote push). */
export async function notifyVendorNewOrderLocal({ itemCount = 0, itemsTotal = 0, extraFee = 0, orderId }) {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    await ensureArmadaAndroidNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'New kitchen order',
        body: `${itemCount} item(s) · J$${itemsTotal} + J$${extraFee} detour`,
        sound: true,
        data: { type: 'vendor_food_order', orderId: orderId || '' },
        ...androidLocalNotificationContentPatch(),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Vendor order local notification failed:', e?.message);
  }
}

/** Rider on Bidding screen — local alert when a new driver bid arrives while app is backgrounded / screen locked. */
export async function notifyRiderNewBidLocal({ title, body, rideId }) {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    await ensureArmadaAndroidNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'New driver offer',
        body: body || 'Open Armada to review bids.',
        sound: true,
        data: { type: 'bid', rideId: rideId != null ? String(rideId) : '' },
        ...androidLocalNotificationContentPatch(),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Rider bid local notification failed:', e?.message);
  }
}

export async function notifyDriverSplitFareLocal({ riderName, splitCount, bidPrice }) {
  if (Platform.OS === 'web' || isExpoGo) return;
  const n = Number(splitCount) || 1;
  if (n < 2) return;
  const total = bidPrice != null ? `Total ride bid J$${bidPrice} (split ${n} ways).` : `Fare split ${n} ways.`;
  try {
    await ensureArmadaAndroidNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Split fare ride',
        body: `${riderName || 'Rider'}: ${n} passengers · ${total}`,
        sound: true,
        ...androidLocalNotificationContentPatch(),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Split fare local notification failed:', e?.message);
  }
}
