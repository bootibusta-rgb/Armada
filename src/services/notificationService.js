/**
 * Push notification service - registers token and handles incoming notifications.
 *
 * Expected notification payloads (from backend/Cloud Functions):
 * - "Your driver is X min away" – use real ETA (e.g. 2 min), not generic "10 min"
 * - "Ride cancelled—refund issued" – include deep link: armada://ride/{rideId}/receipt
 *
 * Deep link handling: armada://ride/{rideId}/receipt opens RideReceiptScreen
 *
 * Note: Push notifications were removed from Expo Go in SDK 53. Use a dev build to test.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

const isExpoGo = Constants.appOwnership === 'expo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  if (isExpoGo) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    if (status !== 'granted') return null;
  }
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (e) {
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
