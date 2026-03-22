import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';
import { useNativeAuth } from './authService';

const STORAGE_KEY = '@armada_emergency_contacts';
const DEFAULT_CONTACTS = [{ id: '1', name: 'Emergency', phone: '+18765551234' }];

export const getEmergencyContacts = async (userId) => {
  try {
    if (isFirebaseReady && db && userId) {
      const snap = await getDoc(doc(db, 'users', userId));
      const contacts = snap.data()?.emergencyContacts;
      if (contacts?.length) return contacts;
    }
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_CONTACTS;
  } catch (e) {
    return DEFAULT_CONTACTS;
  }
};

export const saveEmergencyContacts = async (userId, contacts) => {
  const cleaned = contacts
    .filter((c) => c.phone?.trim())
    .map((c, i) => ({
      id: c.id || `c${i}`,
      name: c.name?.trim() || 'Contact',
      phone: c.phone.trim(),
      uid: c.uid || null,
    }));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  if (isFirebaseReady && db && userId) {
    try {
      await updateDoc(doc(db, 'users', userId), {
        emergencyContacts: cleaned,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Firestore save failed:', e);
    }
  }
  return cleaned;
};

/**
 * Look up Armada user by phone (users must have phone in profile)
 */
export async function findAppUserByPhone(phone) {
  if (!isFirebaseReady || !db || !phone?.trim()) return null;
  try {
    const q = query(
      collection(db, 'users'),
      where('phone', '==', phone.trim())
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return { uid: d.id, name: data?.name, phone: data?.phone };
  } catch (e) {
    return null;
  }
}

/**
 * Subscribe to contact's online status (lastSeen) via onSnapshot
 */
export function subscribeToContactOnline(uid, callback) {
  if (!isFirebaseReady || !db || !uid) return () => {};
  const unsubscribe = onSnapshot(doc(db, 'users', uid), (snap) => {
    const data = snap.data();
    const lastSeen = data?.lastSeen ? new Date(data.lastSeen).getTime() : 0;
    const now = Date.now();
    const onlineThreshold = 5 * 60 * 1000; // 5 min
    callback(now - lastSeen < onlineThreshold);
  });
  return unsubscribe;
};

/**
 * Update current user's lastSeen (call when app is active)
 * On native, use RNFB Firestore so auth matches (avoids permission errors before JS SDK sync)
 */
export async function updatePresence(userId) {
  if (!userId || String(userId).startsWith('demo-')) return;
  try {
    if (useNativeAuth) {
      const rnf = require('@react-native-firebase/firestore');
      const { getFirestore, doc, updateDoc } = rnf;
      const rnDb = getFirestore();
      await updateDoc(doc(rnDb, 'users', userId), {
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else if (isFirebaseReady && db) {
      await updateDoc(doc(db, 'users', userId), {
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('Presence update failed:', e);
  }
}
