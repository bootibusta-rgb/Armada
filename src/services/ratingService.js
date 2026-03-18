/**
 * Rating service - rider rates driver, driver rates rider after ride completion.
 */
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

export async function submitRating(rideId, fromUserId, toUserId, rating, role) {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const rideRef = doc(db, 'rides', rideId);
  const rideSnap = await getDoc(rideRef);
  if (!rideSnap.exists()) throw new Error('Ride not found');

  const updates = {};
  if (role === 'rider') {
    updates.driverRating = rating;
    updates.driverRatedAt = serverTimestamp();
  } else {
    updates.riderRating = rating;
    updates.riderRatedAt = serverTimestamp();
  }
  await updateDoc(rideRef, { ...updates, updatedAt: serverTimestamp() });

  await updateUserRating(toUserId, rating);
}

async function updateUserRating(userId, newRating) {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const totalRatings = (data.totalRatings || 0) + 1;
  const currentAvg = data.rating || 4.5;
  const newAvg = (currentAvg * (totalRatings - 1) + newRating) / totalRatings;
  await updateDoc(userRef, {
    rating: Math.round(newAvg * 10) / 10,
    totalRatings,
    updatedAt: serverTimestamp(),
  });
}

export async function hasRated(rideId, role) {
  if (!isFirebaseReady || !db) return false;
  const rideSnap = await getDoc(doc(db, 'rides', rideId));
  const data = rideSnap.data() || {};
  return role === 'rider' ? !!data.driverRating : !!data.riderRating;
}
