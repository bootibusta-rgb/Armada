/**
 * Admin service: monitoring and editing across the entire app.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  db,
} from '../config/firestore';
import { isFirebaseReady } from '../config/firebase';
import { updateRide } from './rideService';
import { updateFoodOrderStatus } from './foodOrderService';
import { updateEmergencyCallStatus } from './emergencyService';
import { updateShift, deleteShift } from './corporateService';
import { updateVehicle } from './vehicleService';

const DAYS_WARNING = 30;

function isExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d < new Date();
}

function expiresWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return !isNaN(d.getTime()) && d >= now && d <= limit;
}

export const getAdminStats = async () => {
  if (!isFirebaseReady || !db) return null;
  const [
    usersSnap,
    ridesSnap,
    ordersSnap,
    emergenciesSnap,
    shiftsSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'rides')),
    getDocs(collection(db, 'food_orders')),
    getDocs(collection(db, 'emergency_calls')),
    getDocs(collection(db, 'corporateShifts')),
  ]);

  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rides = ridesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const emergencies = emergenciesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const shifts = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const usersByRole = {};
  users.forEach((u) => {
    const r = u.role || 'unknown';
    usersByRole[r] = (usersByRole[r] || 0) + 1;
  });

  const ridesByStatus = {};
  rides.forEach((r) => {
    const s = r.status || 'unknown';
    ridesByStatus[s] = (ridesByStatus[s] || 0) + 1;
  });

  const ordersByStatus = {};
  orders.forEach((o) => {
    const s = o.status || 'unknown';
    ordersByStatus[s] = (ordersByStatus[s] || 0) + 1;
  });

  const emergenciesByStatus = {};
  emergencies.forEach((e) => {
    const s = e.status || 'unknown';
    emergenciesByStatus[s] = (emergenciesByStatus[s] || 0) + 1;
  });

  const shiftsByStatus = {};
  shifts.forEach((s) => {
    const st = s.status || 'unknown';
    shiftsByStatus[st] = (shiftsByStatus[st] || 0) + 1;
  });

  const recentRides = [...rides].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
    const tb = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
    return tb - ta;
  }).slice(0, 30);

  const recentUsers = users.slice(0, 20);
  const recentOrders = [...orders].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
    const tb = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
    return tb - ta;
  }).slice(0, 15);
  const recentEmergencies = [...emergencies].sort((a, b) => {
    const ta = new Date(a.timestamp || 0).getTime();
    const tb = new Date(b.timestamp || 0).getTime();
    return tb - ta;
  }).slice(0, 10);
  const recentShifts = [...shifts].slice(0, 15);

  const drivers = users.filter((u) => u.role === 'driver');
  const vehiclesWithDriver = [];
  for (const d of drivers) {
    try {
      const vehiclesSnap = await getDocs(collection(db, 'users', d.id, 'vehicles'));
      vehiclesSnap.docs.forEach((vd) => {
        const v = { id: vd.id, driverId: d.id, driverName: d.name || d.id, ...vd.data() };
        v.registrationExpired = isExpired(v.registrationExpiry);
        v.fitnessExpired = isExpired(v.fitnessExpiry);
        v.registrationExpiringSoon = expiresWithinDays(v.registrationExpiry, DAYS_WARNING);
        v.fitnessExpiringSoon = expiresWithinDays(v.fitnessExpiry, DAYS_WARNING);
        vehiclesWithDriver.push(v);
      });
    } catch (_) {}
  }
  const vehiclesExpiringOrExpired = vehiclesWithDriver.filter(
    (v) => v.registrationExpired || v.fitnessExpired || v.registrationExpiringSoon || v.fitnessExpiringSoon
  );

  return {
    counts: {
      users: users.length,
      rides: rides.length,
      orders: orders.length,
      emergencies: emergencies.length,
      shifts: shifts.length,
      vehicles: vehiclesWithDriver.length,
      vehiclesExpiring: vehiclesExpiringOrExpired.length,
    },
    usersByRole,
    ridesByStatus,
    ordersByStatus,
    emergenciesByStatus,
    shiftsByStatus,
    recentUsers,
    recentRides,
    recentOrders,
    recentEmergencies,
    recentShifts,
    vehiclesExpiringOrExpired,
  };
};

export const adminUpdateVehicle = async (driverId, vehicleId, updates) => {
  await updateVehicle(driverId, vehicleId, updates);
};

export const adminUpdateUser = async (userId, updates) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, 'users', userId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const adminUpdateRide = async (rideId, updates) => {
  await updateRide(rideId, updates);
};

export const adminUpdateFoodOrder = async (orderId, status) => {
  await updateFoodOrderStatus(orderId, status);
};

export const adminUpdateEmergency = async (callId, status) => {
  await updateEmergencyCallStatus(callId, status);
};

export const adminUpdateShift = async (shiftId, updates) => {
  await updateShift(shiftId, updates);
};

export const adminDeleteShift = async (shiftId) => {
  await deleteShift(shiftId);
};
