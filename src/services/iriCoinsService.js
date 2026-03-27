import { doc, getDoc, updateDoc, increment, db } from '../config/firestore';
import { isFirebaseReady } from '../config/firebase';
import { MAX_COIN_REDEMPTIONS_PER_MONTH } from '../constants/armadaCoins';

const EARN_RATE = 1; // 1 Armada coin per J$100 spent
const REDEEM_RATE = 100; // bundle: redeem this many coins at once
export const REDEEM_DISCOUNT = 100; // J$100 off (1 coin = J$1 toward this bundle)

export function getCurrentRedemptionMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Used for UI: how many redemptions used / left this calendar month (local timezone). */
export function getRedemptionSummary(profile) {
  const limit = MAX_COIN_REDEMPTIONS_PER_MONTH;
  const monthKey = getCurrentRedemptionMonthKey();
  const storedMonth = profile?.coinRedemptionMonth;
  const rawCount = storedMonth === monthKey ? (profile?.coinRedemptionCount ?? 0) : 0;
  const used = Math.min(rawCount, limit);
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, monthKey };
}

export function canApplyCoinRedemption(profile, coinsBalance) {
  const { remaining } = getRedemptionSummary(profile);
  return (coinsBalance ?? 0) >= REDEEM_RATE && remaining > 0;
}

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
  const data = snap.data() || {};
  const current = data.irieCoins || 0;
  if (current < coinsToRedeem) throw new Error('Insufficient Armada coins');

  const monthKey = getCurrentRedemptionMonthKey();
  const storedMonth = data.coinRedemptionMonth;
  let count = storedMonth === monthKey ? (data.coinRedemptionCount ?? 0) : 0;
  if (count >= MAX_COIN_REDEMPTIONS_PER_MONTH) {
    throw new Error('You have used all 3 coin redemptions this month. Resets on the 1st.');
  }

  const discount = (coinsToRedeem / REDEEM_RATE) * REDEEM_DISCOUNT;
  await updateDoc(userRef, {
    irieCoins: increment(-coinsToRedeem),
    coinRedemptionMonth: monthKey,
    coinRedemptionCount: count + 1,
    updatedAt: new Date().toISOString(),
  });
  return discount;
};

export const getCoinsBalance = async (userId) => {
  if (!isFirebaseReady || !db) return 0;
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.data()?.irieCoins || 0;
};
