import { haversineKm } from './haversine';
import { getRidePickupCoords } from './ridePickupCoords';

/** Hide zombie `bidding` rows on the driver feed (still `status: bidding` in Firestore). */
export const BIDDING_RIDE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** Only auto-popup / sound for requests newer than this (avoids stale rows when GPS filter widens). */
export const BIDDING_POPUP_MAX_AGE_MS = 45 * 60 * 1000;

/**
 * Match rider ↔ driver discovery scale: only show requests whose pickup is roughly in service range.
 * (Firestore cannot geo-query this collection without geohash; filter on device.)
 */
export const DRIVER_BIDDING_FEED_MAX_DISTANCE_KM = 15;

function firestoreTimeToMs(t) {
  if (t == null) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return null;
}

/** Prefer `createdAt`, then `updatedAt` — missing both → treat as too old for feed/popup. */
export function biddingRideActivityMs(ride) {
  const created = firestoreTimeToMs(ride?.createdAt);
  if (created != null) return created;
  const updated = firestoreTimeToMs(ride?.updatedAt);
  if (updated != null) return updated;
  return null;
}

export function isBiddingRideWithinAge(ride, maxAgeMs, nowMs = Date.now()) {
  const ms = biddingRideActivityMs(ride);
  if (ms == null) return false;
  return nowMs - ms <= maxAgeMs;
}

/**
 * @param {object[]} rides — mapped ride objects (must include pickup/dropoff; `createdAt` recommended)
 * @param {{ latitude: number, longitude: number } | null} driverGps
 * @param {{ maxAgeMs?: number, maxDistanceKm?: number, skipDistanceFilter?: boolean }} [options]
 * @returns {object[]}
 */
export function filterBiddingRidesForDriverFeed(rides, driverGps, options = {}) {
  const maxAge = options.maxAgeMs ?? BIDDING_RIDE_MAX_AGE_MS;
  const maxKm = options.maxDistanceKm ?? DRIVER_BIDDING_FEED_MAX_DISTANCE_KM;
  const skipDistance = options.skipDistanceFilter === true;
  const now = Date.now();

  return (rides || []).filter((r) => {
    if (!isBiddingRideWithinAge(r, maxAge, now)) return false;

    if (skipDistance) return true;

    if (
      driverGps &&
      typeof driverGps.latitude === 'number' &&
      typeof driverGps.longitude === 'number' &&
      !Number.isNaN(driverGps.latitude) &&
      !Number.isNaN(driverGps.longitude)
    ) {
      const p = getRidePickupCoords(r);
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
        // Keep if we can't resolve pickup — better than hiding all string-only requests
        return true;
      }
      const km = haversineKm(driverGps.latitude, driverGps.longitude, p.lat, p.lng);
      if (km != null && km > maxKm) return false;
    }

    return true;
  });
}
