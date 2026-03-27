/**
 * Vehicle service - upload photos, manage driver fleet.
 * Vehicles stored in users/{driverId}/vehicles/{vehicleId}
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  db,
} from '../config/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseReady } from '../config/firebase';

export const uploadVehiclePhoto = async (driverId, uri) => {
  if (!isFirebaseReady || !storage || !driverId) throw new Error('Firebase not configured');
  const filename = `vehicles/${driverId}/${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytesResumable(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const uploadDocumentPhoto = async (driverId, vehicleId, docType, uri) => {
  if (!isFirebaseReady || !storage || !driverId) throw new Error('Firebase not configured');
  const filename = `vehicles/${driverId}/${vehicleId || 'new'}/${docType}_${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytesResumable(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const addVehicle = async (driverId, vehicleData) => {
  if (!isFirebaseReady || !db || !driverId) throw new Error('Firebase not configured');
  const vehiclesRef = collection(db, 'users', driverId, 'vehicles');
  const docRef = await addDoc(vehiclesRef, {
    ...vehicleData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateVehicle = async (driverId, vehicleId, updates) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, 'users', driverId, 'vehicles', vehicleId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const deleteVehicle = async (driverId, vehicleId) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await deleteDoc(doc(db, 'users', driverId, 'vehicles', vehicleId));
};

export const getVehicles = async (driverId) => {
  if (!isFirebaseReady || !db || !driverId) return [];
  const snap = await getDocs(collection(db, 'users', driverId, 'vehicles'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const subscribeToVehicles = (driverId, callback) => {
  if (!isFirebaseReady || !db || !driverId) return () => {};
  return onSnapshot(collection(db, 'users', driverId, 'vehicles'), (snap) => {
    const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(vehicles);
  });
};
