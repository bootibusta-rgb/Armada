import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

const EARN_RATE = 1; // 1 Armada coin per J$100 spent
const REDEEM_RATE = 100; // 100 coins = J$50 off
export const REDEEM_DISCOUNT = 50; // J$50 off

export const earnCoins = async (userId, fareAmount) => {
  if (!isFirebaseReady || !db) return 0;
  const coins = Math.floor(fareAmount / 100) * EARN_RATE;
  if (coins <= 0) return 0;
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    irieCoins: increment(coins),
    updatedAt: new Date().toISOString(),
  });
  return coins;
};

export const redeemCoins = async (userId, coinsToRedeem = REDEEM_RATE) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  const current = snap.data()?.irieCoins || 0;
  if (current < coinsToRedeem) throw new Error('Insufficient Armada coins');
  const discount = (coinsToRedeem / REDEEM_RATE) * REDEEM_DISCOUNT;
  await updateDoc(userRef, {
    irieCoins: increment(-coinsToRedeem),
    updatedAt: new Date().toISOString(),
  });
  return discount;
};

export const getCoinsBalance = async (userId) => {
  if (!isFirebaseReady || !db) return 0;
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.data()?.irieCoins || 0;
};
