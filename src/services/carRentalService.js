/**
 * Car Rental listings (user profiles role carRental) and rental requests.
 */
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  db,
} from '../config/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseReady } from '../config/firebase';
import { haversineKm } from '../utils/haversine';
import {
  CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD,
  CAR_RENTAL_LISTING_WEEK_DAYS,
} from '../config/carRentalPricing';

export const RENTAL_LOCATION_PRESETS = [
  { id: 'Kingston', label: 'Kingston', lat: 18.0179, lng: -76.8099 },
  { id: 'Spanish Town', label: 'Spanish Town', lat: 17.9911, lng: -76.9574 },
  { id: 'Portmore', label: 'Portmore', lat: 17.955, lng: -76.867 },
  { id: 'Montego Bay', label: 'Montego Bay', lat: 18.4712, lng: -77.9188 },
  { id: 'Ocho Rios', label: 'Ocho Rios', lat: 18.4074, lng: -77.1031 },
];

export const getPresetById = (id) =>
  RENTAL_LOCATION_PRESETS.find((p) => p.id === id) || RENTAL_LOCATION_PRESETS[0];

export const uploadCarRentalPhoto = async (userId, uri) => {
  if (!isFirebaseReady || !storage || !userId) throw new Error('Firebase not configured');
  const filename = `car_rentals/${userId}/${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytesResumable(storageRef, blob);
  return getDownloadURL(storageRef);
};

/** Registration / insurance / fitness docs for a listed vehicle */
export const uploadCarRentalVehicleDoc = async (userId, vehicleSlot, docType, uri) => {
  if (!isFirebaseReady || !storage || !userId) throw new Error('Firebase not configured');
  const safeSlot = String(vehicleSlot || 'primary').replace(/[^a-z0-9_-]/gi, '_');
  const safeType = String(docType || 'doc').replace(/[^a-z0-9_-]/gi, '_');
  const filename = `car_rentals/${userId}/docs/${safeSlot}_${safeType}_${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytesResumable(storageRef, blob);
  return getDownloadURL(storageRef);
};

/** Number of vehicles counted for weekly listing fee (primary + alternates). */
export function countRentalVehiclesForBilling(profileLike) {
  if (!profileLike) return 1;
  const alts = Array.isArray(profileLike.rentalAlternateVehicles) ? profileLike.rentalAlternateVehicles : [];
  return 1 + alts.length;
}

export function isCarRentalListingSubscriptionActive(data) {
  const ex = data?.rentalListingSubscription?.expiresAt;
  if (!ex) return false;
  return new Date(ex) > new Date();
}

/** Rider-visible listing: paid week + ID verified + owner marked available. */
export function isCarRentalPublishedForRiders(data) {
  return (
    data?.role === 'carRental'
    && data?.idVerified === true
    && isCarRentalListingSubscriptionActive(data)
    && data?.rentalAvailable !== false
  );
}

export function computeWeeklyListingTotalJmd(vehicleCount) {
  const n = Math.max(1, Math.min(50, parseInt(String(vehicleCount), 10) || 1));
  return n * CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD;
}

/** Extend or start listing subscription by one week per vehicle count (client-side; replace with payment API). */
export function buildRenewedRentalListingSubscription(existing, vehicleCount) {
  const n = Math.max(1, Math.min(50, parseInt(String(vehicleCount), 10) || 1));
  const now = new Date();
  const prevEx = existing?.expiresAt ? new Date(existing.expiresAt) : null;
  const startFrom = prevEx && prevEx > now ? prevEx : now;
  const next = new Date(startFrom);
  next.setDate(next.getDate() + CAR_RENTAL_LISTING_WEEK_DAYS);
  const amount = computeWeeklyListingTotalJmd(n);
  return {
    expiresAt: next.toISOString(),
    weeklyRatePerVehicleJmd: CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD,
    vehicleCountBilled: n,
    amountPaidJmd: amount,
    periodDays: CAR_RENTAL_LISTING_WEEK_DAYS,
    status: 'active',
    updatedAt: now.toISOString(),
  };
}

const mapUserToRentalListing = (d) => {
  const data = d.data();
  const published = isCarRentalPublishedForRiders({ ...data, role: 'carRental' });
  return {
    id: d.id,
    uid: d.id,
    name: data.name || 'Car Rental',
    vehicleDisplayName: data.rentalVehicleName || data.name || 'Vehicle',
    licensePlate: data.rentalLicensePlate || '',
    dailyRate: typeof data.rentalDailyRate === 'number' ? data.rentalDailyRate : parseFloat(data.rentalDailyRate) || 0,
    rentalLocation: data.rentalLocation || '',
    rentalAddress: data.rentalAddress || '',
    lat: typeof data.rentalLat === 'number' ? data.rentalLat : parseFloat(data.rentalLat) || 18.0179,
    lng: typeof data.rentalLng === 'number' ? data.rentalLng : parseFloat(data.rentalLng) || -76.8099,
    photoUrls: Array.isArray(data.rentalPhotoUrls) ? data.rentalPhotoUrls : [],
    rentalAlternateVehicles: Array.isArray(data.rentalAlternateVehicles) ? data.rentalAlternateVehicles : [],
    rentalAvailable: data.rentalAvailable !== false,
    published,
  };
};

/** Primary + alternates for owner “suggest another” picker */
export function buildOwnerRentalFleet(ownerProfile) {
  if (!ownerProfile) return [];
  const primary = {
    id: 'primary',
    label: ownerProfile.rentalVehicleName || 'Listed vehicle',
    plate: ownerProfile.rentalLicensePlate || '',
    dailyRate:
      typeof ownerProfile.rentalDailyRate === 'number'
        ? ownerProfile.rentalDailyRate
        : parseFloat(ownerProfile.rentalDailyRate) || 0,
    photoUrls: Array.isArray(ownerProfile.rentalPhotoUrls) ? ownerProfile.rentalPhotoUrls : [],
  };
  const alts = Array.isArray(ownerProfile.rentalAlternateVehicles) ? ownerProfile.rentalAlternateVehicles : [];
  const mappedAlts = alts.map((a, i) => ({
    id: `alt-${i}`,
    label: a.label || a.name || `Vehicle ${i + 2}`,
    plate: a.plate || '',
    dailyRate: typeof a.dailyRate === 'number' ? a.dailyRate : parseFloat(a.dailyRate) || 0,
    photoUrls: Array.isArray(a.photoUrls) ? a.photoUrls : [],
  }));
  return [primary, ...mappedAlts];
}

export async function fetchUserProfileDoc(uid) {
  if (!isFirebaseReady || !db || !uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export const fetchCarRentalsOnce = async () => {
  if (!isFirebaseReady || !db) return [];
  const q = query(collection(db, 'users'), where('role', '==', 'carRental'));
  const snap = await getDocs(q);
  return snap.docs.map(mapUserToRentalListing).filter((r) => r.published);
};

export const subscribeToCarRentals = (callback) => {
  if (!isFirebaseReady || !db) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'users'), where('role', '==', 'carRental'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapUserToRentalListing).filter((r) => r.published);
      callback(list);
    },
    () => callback([])
  );
};

/** Filter listings “near” rider context: same area name or within maxKm of reference coords */
export function filterCarRentalsNear(list, { pickupText = '', refLat, refLng, maxKm = 25 }) {
  if (!list?.length) return list;
  const text = (pickupText || '').toLowerCase();
  const byArea = list.filter((r) => {
    const loc = (r.rentalLocation || '').toLowerCase();
    if (!loc) return true;
    return text.includes(loc) || loc.split(' ').some((w) => w.length > 2 && text.includes(w));
  });
  if (byArea.length > 0) return byArea;

  const lat = refLat ?? 18.0179;
  const lng = refLng ?? -76.8099;
  return list
    .map((r) => ({ ...r, _km: haversineKm(lat, lng, r.lat, r.lng) }))
    .filter((r) => r._km <= maxKm)
    .sort((a, b) => a._km - b._km)
    .map(({ _km, ...rest }) => rest);
}

export const createCarRentalRequest = async ({
  riderId,
  ownerId,
  ownerName,
  licensePlate,
  vehicleDisplayName,
  dailyRate,
  rentalLocation,
  riderName,
  riderPhone,
  riderPickupSpot,
  riderTimeLabel,
  riderMessage,
  riderPhotoUrl,
}) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const payload = {
    riderId,
    ownerId,
    ownerName: ownerName || '',
    licensePlate: licensePlate || '',
    vehicleDisplayName: vehicleDisplayName || '',
    dailyRate: dailyRate ?? 0,
    rentalLocation: rentalLocation || '',
    riderName: riderName || '',
    riderPhone: riderPhone || '',
    riderPickupSpot: riderPickupSpot || '',
    riderTimeLabel: riderTimeLabel || '',
    riderMessage: riderMessage || '',
    riderPhotoUrl: riderPhotoUrl || null,
    status: 'pending',
    counterOffer: null,
    bookedUntil: null,
    riderVisibleMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const refDoc = await addDoc(collection(db, 'car_rental_requests'), payload);
  return refDoc.id;
};

export const subscribeCarRentalRequestsForOwner = (ownerId, callback) => {
  if (!isFirebaseReady || !db || !ownerId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'car_rental_requests'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(rows);
    },
    () => callback([])
  );
};

export const updateCarRentalRequestStatus = async (requestId, status) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, 'car_rental_requests', requestId), {
    status,
    updatedAt: new Date().toISOString(),
  });
};

export const patchCarRentalRequest = async (requestId, partial) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, 'car_rental_requests', requestId), {
    ...partial,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeCarRentalRequest = (requestId, callback) => {
  if (!isFirebaseReady || !db || !requestId) {
    callback(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'car_rental_requests', requestId),
    (snap) => {
      if (!snap.exists()) callback(null);
      else callback({ id: snap.id, ...snap.data() });
    },
    () => callback(null)
  );
};

export const subscribeCarRentalRequestsForRider = (riderId, callback) => {
  if (!isFirebaseReady || !db || !riderId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'car_rental_requests'), where('riderId', '==', riderId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
      callback(rows);
    },
    () => callback([])
  );
};
