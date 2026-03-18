/**
 * Emergency service: handles emergency alerts to app users vs phone-only contacts.
 * - App users: Firestore signal + optional video call (WebRTC)
 * - Non-app users: SMS + location link
 */
import { collection, addDoc, doc, onSnapshot, updateDoc, query, where } from 'firebase/firestore';
import { ref, set, push, onValue } from 'firebase/database';
import { db, realtimeDb, isFirebaseReady } from '../config/firebase';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { Linking } from 'react-native';

const EMERGENCY_CALLS_COLLECTION = 'emergency_calls';

/**
 * Send emergency to app user: write to Firestore, contact's app listens via onSnapshot
 */
export async function sendEmergencyToAppUser(contact, fromUser, location) {
  if (!isFirebaseReady || !db) return null;
  const { uid, name, phone } = contact;
  if (!uid) return null;
  const docRef = await addDoc(collection(db, EMERGENCY_CALLS_COLLECTION), {
    fromUid: fromUser.id,
    fromName: fromUser.name || 'Rider',
    fromPhone: fromUser.phone || null,
    toUid: uid,
    toPhone: phone,
    lat: location?.latitude ?? 18.0179,
    lng: location?.longitude ?? -76.8099,
    status: 'ringing',
    timestamp: new Date().toISOString(),
  });
  return docRef.id;
}

const WEBRTC_SIGNALING_PATH = 'webrtc_signaling';

export function setWebRTCOffer(callId, offer) {
  if (!realtimeDb) return Promise.reject(new Error('Realtime DB not configured'));
  return set(ref(realtimeDb, `${WEBRTC_SIGNALING_PATH}/${callId}/offer`), offer);
}

export function setWebRTCAnswer(callId, answer) {
  if (!realtimeDb) return Promise.reject(new Error('Realtime DB not configured'));
  return set(ref(realtimeDb, `${WEBRTC_SIGNALING_PATH}/${callId}/answer`), answer);
}

export function pushWebRTCIceCandidate(callId, fromUid, candidate) {
  if (!realtimeDb) return Promise.reject(new Error('Realtime DB not configured'));
  return push(ref(realtimeDb, `${WEBRTC_SIGNALING_PATH}/${callId}/ice`), { from: fromUid, candidate });
}

export function subscribeToWebRTCSignaling(callId, onOffer, onAnswer, onIce) {
  if (!realtimeDb) return () => {};
  const unsubOffer = onValue(ref(realtimeDb, `${WEBRTC_SIGNALING_PATH}/${callId}/offer`), (s) => {
    if (s.val()) onOffer(s.val());
  });
  const unsubAnswer = onValue(ref(realtimeDb, `${WEBRTC_SIGNALING_PATH}/${callId}/answer`), (s) => {
    if (s.val()) onAnswer(s.val());
  });
  const unsubIce = onValue(ref(realtimeDb, `${WEBRTC_SIGNALING_PATH}/${callId}/ice`), (s) => {
    const val = s.val();
    if (val) Object.values(val).forEach((v) => v?.candidate && onIce(v));
  });
  return () => {
    unsubOffer();
    unsubAnswer();
    unsubIce();
  };
}

/**
 * Subscribe to incoming emergency calls for current user
 */
export function subscribeToIncomingEmergency(userId, onCall) {
  if (!isFirebaseReady || !db || !userId) return () => {};
  const q = query(
    collection(db, EMERGENCY_CALLS_COLLECTION),
    where('toUid', '==', userId)
  );
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      const d = change.doc;
      const data = d.data();
      if (data.status === 'ringing') {
        onCall({ id: d.id, ...data });
      }
    });
  });
  return unsubscribe;
}

/**
 * Update emergency call status (e.g. answered, declined, video-call-requested)
 */
export async function updateEmergencyCallStatus(callId, status) {
  if (!isFirebaseReady || !db) return;
  await updateDoc(doc(db, EMERGENCY_CALLS_COLLECTION, callId), { status });
}

/**
 * Subscribe to emergency call doc (for rider to detect video-call-requested)
 */
export function subscribeToEmergencyCall(callId, callback) {
  if (!isFirebaseReady || !db || !callId) return () => {};
  return onSnapshot(doc(db, EMERGENCY_CALLS_COLLECTION, callId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/**
 * Send emergency to non-app user: SMS with location link
 */
export function sendEmergencyToPhone(contact, location) {
  const { phone, name } = contact;
  if (!phone?.trim()) return;
  const lat = location?.latitude ?? 18.0179;
  const lng = location?.longitude ?? -76.8099;
  const msg = `Emergency - I need help on Armada ride. Track me: https://maps.google.com/?q=${lat},${lng}`;
  Linking.openURL(`sms:${phone.trim()}?body=${encodeURIComponent(msg)}`);
}

/**
 * Start emergency call (phone dial)
 */
export function startEmergencyCall(contact) {
  const { phone } = contact;
  if (!phone?.trim()) return;
  Linking.openURL(`tel:${phone.trim()}`);
}

/**
 * Speak emergency message (voice note simulation - for accessibility / hands-free)
 */
export function speakEmergencyMessage(message) {
  Speech.speak(message || 'Emergency. I need help on my Armada ride. Please check my location.', {
    rate: 0.9,
  });
}

/**
 * Get current location for emergency
 */
export async function getCurrentLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { latitude: 18.0179, longitude: -76.8099 };
    const loc = await Location.getCurrentPositionAsync({});
    return loc.coords;
  } catch (e) {
    return { latitude: 18.0179, longitude: -76.8099 };
  }
}
