import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

export const createShift = async (companyId, shiftData) => {
  const shiftsRef = collection(db, 'corporateShifts');
  const docRef = await addDoc(shiftsRef, {
    ...shiftData,
    companyId,
    companyName: shiftData.companyName || 'Company',
    status: 'open',
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const subscribeToShifts = (companyId, callback) => {
  const q = query(
    collection(db, 'corporateShifts'),
    where('companyId', '==', companyId)
  );
  return onSnapshot(q, (snap) => {
    const shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(shifts);
  });
};

export const subscribeToDriverShifts = (callback) => {
  const q = query(
    collection(db, 'corporateShifts'),
    where('status', '==', 'open')
  );
  return onSnapshot(q, (snap) => {
    const shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(shifts);
  });
};

export const acceptShift = async (shiftId, driverId) => {
  await updateDoc(doc(db, 'corporateShifts', shiftId), {
    driverId,
    status: 'assigned',
    updatedAt: serverTimestamp(),
  });
};

export const getCompanyRides = async (companyId) => {
  const ridesRef = collection(db, 'rides');
  const q = query(
    ridesRef,
    where('companyId', '==', companyId),
    where('status', 'in', ['completed', 'accepted'])
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const updateShift = async (shiftId, updates) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, 'corporateShifts', shiftId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const deleteShift = async (shiftId) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await deleteDoc(doc(db, 'corporateShifts', shiftId));
};

export const getEmployees = async (companyId) => {
  if (!isFirebaseReady || !db || !companyId) return [];
  const snap = await getDoc(doc(db, 'users', companyId));
  const data = snap.data();
  return data?.employees || [];
};

export const saveEmployees = async (companyId, employees) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const cleaned = employees
    .filter((e) => e.name?.trim())
    .map((e, i) => ({
      id: e.id || `emp-${i}`,
      name: e.name.trim(),
      phone: e.phone?.trim() || '',
      email: e.email?.trim() || '',
      department: e.department?.trim() || '',
    }));
  await updateDoc(doc(db, 'users', companyId), {
    employees: cleaned,
    updatedAt: serverTimestamp(),
  });
  return cleaned;
};

export const getCorporateStats = async (companyId) => {
  const [shiftsSnap, ridesSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'corporateShifts'),
        where('companyId', '==', companyId),
        where('status', '==', 'assigned')
      )
    ),
    getDocs(
      query(
        collection(db, 'rides'),
        where('companyId', '==', companyId),
        where('status', '==', 'completed')
      )
    ),
  ]);
  const assignedDrivers = shiftsSnap.size;
  const rides = ridesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const now = new Date();

  const thisMonth = rides.filter((r) => {
    const d = r.completedAt ? new Date(r.completedAt) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const thisWeek = rides.filter((r) => {
    const d = r.completedAt ? new Date(r.completedAt) : null;
    return d && d >= startOfWeek;
  });

  const totalSpent = thisMonth.reduce((sum, r) => sum + (r.finalFare || r.bidPrice || 0), 0);
  const TAXI_MULTIPLIER = 1.4;
  const costSavings = Math.round(totalSpent * (TAXI_MULTIPLIER - 1));

  const allRidesWithFare = rides.filter((r) => (r.finalFare || r.bidPrice || 0) > 0);
  const averageFare = allRidesWithFare.length > 0
    ? Math.round(allRidesWithFare.reduce((s, r) => s + (r.finalFare || r.bidPrice || 0), 0) / allRidesWithFare.length)
    : 0;

  const deptCounts = {};
  rides.forEach((r) => {
    const dept = (r.department || 'Unassigned').trim() || 'Unassigned';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const topDepartments = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const sorted = [...rides].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  return {
    assignedDrivers,
    ridesThisMonth: thisMonth.length,
    ridesThisWeek: thisWeek.length,
    costSavings,
    averageFare,
    topDepartments,
    recentRides: sorted.slice(0, 10),
  };
};
