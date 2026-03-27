/**
 * Single Firestore client for the app.
 * On native dev builds, uses @react-native-firebase/firestore so Security Rules see RN Auth.
 * The Firebase JS SDK Firestore (firebase/firestore) stays unauthenticated when custom-token sync fails.
 */
import { Platform } from 'react-native';

export let db = null;

export let addDoc;
export let collection;
export let deleteDoc;
export let doc;
export let getDoc;
export let getDocs;
export let increment;
export let limit;
export let onSnapshot;
export let orderBy;
export let query;
export let serverTimestamp;
export let setDoc;
export let Timestamp;
export let updateDoc;
export let where;

function assignFirestoreModule(mod, app, useRnDefaultApp) {
  addDoc = mod.addDoc;
  collection = mod.collection;
  deleteDoc = mod.deleteDoc;
  doc = mod.doc;
  getDoc = mod.getDoc;
  getDocs = mod.getDocs;
  increment = mod.increment;
  limit = mod.limit;
  onSnapshot = mod.onSnapshot;
  orderBy = mod.orderBy;
  query = mod.query;
  serverTimestamp = mod.serverTimestamp;
  setDoc = mod.setDoc;
  Timestamp = mod.Timestamp;
  updateDoc = mod.updateDoc;
  where = mod.where;

  db = useRnDefaultApp ? mod.getFirestore() : mod.getFirestore(app);
}

export function attachFirestore(app) {
  if (Platform.OS !== 'web') {
    try {
      const rn = require('@react-native-firebase/firestore');
      assignFirestoreModule(rn, app, true);
      return;
    } catch (e) {
      console.warn('[Firestore] Using web SDK on native (RN Firestore unavailable)', e?.message);
    }
  }
  const web = require('firebase/firestore');
  assignFirestoreModule(web, app, false);
}
