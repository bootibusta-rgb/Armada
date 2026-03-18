import { collection, doc, addDoc, updateDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

export const createFoodOrder = async (rideId, vendorId, items, extraFee, itemsTotal = 0, itemsWithPrices = []) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const orderData = {
    rideId,
    vendorId,
    items,
    status: 'pending',
    extraFee,
    createdAt: serverTimestamp(),
  };
  if (itemsTotal > 0) orderData.itemsTotal = itemsTotal;
  if (itemsWithPrices?.length) orderData.itemsWithPrices = itemsWithPrices;
  const ref = await addDoc(collection(db, 'food_orders'), orderData);
  return ref.id;
};

export const updateFoodOrderStatus = async (foodOrderId, status) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, 'food_orders', foodOrderId), {
    status,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToFoodOrdersByRide = (rideId, callback) => {
  if (!isFirebaseReady || !db) return () => {};
  const q = query(
    collection(db, 'food_orders'),
    where('rideId', '==', rideId)
  );
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(orders);
  });
};

export const subscribeToFoodOrdersByVendor = (vendorId, callback) => {
  if (!isFirebaseReady || !db) return () => {};
  const q = query(
    collection(db, 'food_orders'),
    where('vendorId', '==', vendorId)
  );
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(orders);
  });
};
