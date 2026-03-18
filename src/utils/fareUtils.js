import { haversineKm } from './haversine';

const BASE_FEE = 100;
const PER_KM_FEE = 50.5;

const PLACE_COORDS = {
  'kingston': { lat: 18.0179, lng: -76.8099 },
  'kingston, jamaica': { lat: 18.0179, lng: -76.8099 },
  'montego bay': { lat: 18.4712, lng: -77.9188 },
  'montego bay, jamaica': { lat: 18.4712, lng: -77.9188 },
  'ocho rios': { lat: 18.4025, lng: -77.1048 },
  'negril': { lat: 18.2682, lng: -78.3481 },
  'port antonio': { lat: 18.1762, lng: -76.4510 },
  'spanish town': { lat: 17.9911, lng: -76.9574 },
};

function normalizePlace(str) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().toLowerCase();
}

function lookupCoords(place) {
  const key = normalizePlace(place);
  if (!key) return null;
  for (const [k, coords] of Object.entries(PLACE_COORDS)) {
    if (key.includes(k) || k.includes(key)) return coords;
  }
  return null;
}

export function getRouteCoords(pickup, dropoff) {
  const pickupCoords = lookupCoords(pickup) || PLACE_COORDS['kingston'];
  const dropoffCoords = lookupCoords(dropoff) || PLACE_COORDS['montego bay'];
  return { pickupCoords, dropoffCoords };
}

export function getDistanceBasedFare(pickup, dropoff) {
  const { pickupCoords, dropoffCoords } = getRouteCoords(pickup, dropoff);
  const km = haversineKm(
    pickupCoords.lat,
    pickupCoords.lng,
    dropoffCoords.lat,
    dropoffCoords.lng
  );
  return Math.round(BASE_FEE + km * PER_KM_FEE);
}

const NEAR_ROUTE_KM = 25;

export function getVendorsNearRoute(vendors, pickup, dropoff) {
  const { pickupCoords, dropoffCoords } = getRouteCoords(pickup, dropoff);
  const midLat = (pickupCoords.lat + dropoffCoords.lat) / 2;
  const midLng = (pickupCoords.lng + dropoffCoords.lng) / 2;
  const directKm = haversineKm(
    pickupCoords.lat,
    pickupCoords.lng,
    dropoffCoords.lat,
    dropoffCoords.lng
  );
  return vendors.filter((v) => {
    const toMid = haversineKm(v.lat, v.lng, midLat, midLng);
    const toPickup = haversineKm(v.lat, v.lng, pickupCoords.lat, pickupCoords.lng);
    const toDropoff = haversineKm(v.lat, v.lng, dropoffCoords.lat, dropoffCoords.lng);
    return toMid <= NEAR_ROUTE_KM || toPickup <= NEAR_ROUTE_KM || toDropoff <= NEAR_ROUTE_KM;
  });
}
