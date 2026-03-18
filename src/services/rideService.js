import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, set, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { db, realtimeDb, functions, isFirebaseReady } from '../config/firebase';
import { createFoodOrder } from './foodOrderService';
import { analyticsEvents } from './analyticsService';

export const createRideRequest = async (rideData) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const { foodStop, stops, ...rest } = rideData;
  const ridesRef = collection(db, 'rides');
  const ridePayload = {
    ...rest,
    status: 'bidding',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (rideData.useRedeem) ridePayload.useRedeem = true;
  if (stops && stops.length > 0) ridePayload.stops = stops;
  if (foodStop) {
    ridePayload.foodStop = {
      vendorId: foodStop.vendorId,
      items: foodStop.items,
      itemsTotal: foodStop.itemsTotal || 0,
      extraFee: foodStop.extraFee,
      vendorName: foodStop.vendorName,
    };
  }
  const docRef = await addDoc(ridesRef, ridePayload);
  const rideId = docRef.id;
  analyticsEvents.rideRequested(rideId, ridePayload.bidPrice);
  if (foodStop) {
    try {
      const foodOrderId = await createFoodOrder(
        rideId,
        foodStop.vendorId,
        foodStop.items,
        foodStop.extraFee,
        foodStop.itemsTotal || 0,
        foodStop.itemsWithPrices
      );
      await updateDoc(doc(db, 'rides', rideId), {
        'foodStop.foodOrderId': foodOrderId,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Food order creation failed:', e);
    }
  }
  return rideId;
};

export const getRideById = async (rideId) => {
  if (!isFirebaseReady || !db || !rideId) return null;
  const snap = await getDoc(doc(db, 'rides', rideId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const subscribeToRide = (rideId, callback) => {
  if (!isFirebaseReady || !db) return () => {};
  return onSnapshot(doc(db, 'rides', rideId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
};

export const subscribeToBids = (rideId, callback) => {
  if (!isFirebaseReady || !db || !rideId) return () => {};
  return onSnapshot(
    query(
      collection(db, 'rides', rideId, 'bids'),
      orderBy('createdAt', 'desc')
    ),
    (snap) => {
      const bids = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(bids);
    }
  );
};

export const addBid = async (rideId, bidData) => {
  if (!isFirebaseReady || !db || !rideId) throw new Error('Firebase not configured or ride not found');
  const bidsRef = collection(db, 'rides', rideId, 'bids');
  await addDoc(bidsRef, {
    ...bidData,
    createdAt: serverTimestamp(),
  });
  if (!bidData.riderCounter) {
    analyticsEvents.bidAdded(rideId, bidData.driverId, bidData.price ?? bidData.counterPrice);
  }
};

export const updateRide = async (rideId, updates) => {
  if (!isFirebaseReady || !db || !rideId) throw new Error('Firebase not configured or ride not found');
  await updateDoc(doc(db, 'rides', rideId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const cancelRide = async (rideId, reason, cancelledBy) => {
  if (!isFirebaseReady || !db || !rideId) throw new Error('Firebase not configured or ride not found');
  await updateDoc(doc(db, 'rides', rideId), {
    status: 'cancelled',
    cancellationReason: reason,
    cancelledBy,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateDriverLocation = (driverId, location) => {
  if (!isFirebaseReady || !realtimeDb || !driverId || !location) return;
  set(ref(realtimeDb, `locations/drivers/${driverId}`), {
    ...location,
    updatedAt: Date.now(),
  });
};

export const subscribeToDriverLocation = (driverId, callback) => {
  if (!isFirebaseReady || !realtimeDb) return () => {};
  return onValue(ref(realtimeDb, `locations/drivers/${driverId}`), (snap) => {
    callback(snap.val());
  });
};

export const updateDriverOnlineStatus = async (driverId, isOnline) => {
  if (!isFirebaseReady || !db) return;
  const userRef = doc(db, 'users', driverId);
  await updateDoc(userRef, { isOnline, updatedAt: serverTimestamp() });
};

export const subscribeToDriverActiveRide = (driverId, callback) => {
  if (!isFirebaseReady || !db) return () => {};
  const q = query(
    collection(db, 'rides'),
    where('driverId', '==', driverId),
    where('status', 'in', ['accepted'])
  );
  return onSnapshot(q, (snap) => {
    const ride = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
    callback(ride);
  });
};

export const getNearbyDrivers = async (lat, lng, radiusKm = 10) => {
  const driversRef = collection(db, 'users');
  const q = query(
    driversRef,
    where('role', '==', 'driver'),
    where('isOnline', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getRidesForUser = async (userId, role) => {
  if (!isFirebaseReady || !db) return [];
  const ridesRef = collection(db, 'rides');
  const field = role === 'rider' ? 'riderId' : 'driverId';
  const q = query(
    ridesRef,
    where(field, '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const subscribeToBiddingRides = (callback) => {
  if (!isFirebaseReady || !db) return () => {};
  const q = query(
    collection(db, 'rides'),
    where('status', '==', 'bidding'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const rides = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(rides);
  });
};

/** Notify rider when driver is approaching (real ETA, e.g. 2 min). Called from driver app. */
export const notifyDriverApproaching = async (rideId, etaMinutes) => {
  if (!isFirebaseReady || !functions) return;
  const fn = httpsCallable(functions, 'notifyDriverApproaching');
  await fn({ rideId, etaMinutes });
};
