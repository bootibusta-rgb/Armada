import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const PLATFORM_CUT = 0.2; // 20%

export const getDriverEarnings = async (driverId, period = 'week') => {
  const ridesRef = collection(db, 'rides');
  const q = query(
    ridesRef,
    where('driverId', '==', driverId),
    where('status', '==', 'completed')
  );
  const snap = await getDocs(q);
  const allRides = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const now = new Date();
  let startDate = new Date(now);
  if (period === 'day') startDate.setDate(now.getDate() - 1);
  else if (period === 'week') startDate.setDate(now.getDate() - 7);
  const startMs = startDate.getTime();
  const rides = allRides.filter((r) => {
    const t = r.completedAt ? new Date(r.completedAt).getTime() : 0;
    return t >= startMs;
  });
  const gross = rides.reduce((sum, r) => sum + (r.finalFare || r.bidPrice || 0), 0);
  const platformCut = gross * PLATFORM_CUT;
  const takeHome = gross - platformCut;
  return { gross, platformCut, takeHome, rideCount: rides.length, rides };
};

export const getDriverEarningsWithBreakdown = async (driverId, period = 'week') => {
  const data = await getDriverEarnings(driverId, period);
  return data;
};
