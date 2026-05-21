import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Platform,
  AppState,
  useWindowDimensions,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE, Polyline, Circle } from 'react-native-maps';
import RiderMapMarker from '../../components/RiderMapMarker';
import DropoffMapMarker from '../../components/DropoffMapMarker';
import FoodStopMapMarker from '../../components/FoodStopMapMarker';
import ThemedTextInput from '../../components/ThemedTextInput';
import WaypointDotMapMarker from '../../components/WaypointDotMapMarker';
import NearbyDriversMapOverlay from '../../components/NearbyDriversMapOverlay';
import DriverSearchRadar from '../../components/DriverSearchRadar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getUserProfile, resolveAuthUid } from '../../services/authService';
import { isFirebaseReady } from '../../config/firebase';
import {
  subscribeToBids,
  subscribeToRide,
  addBid,
  updateRide,
  cancelRide,
  getRideById,
  subscribeToDriverDeclinesForReissue,
  bumpRideBidAfterDriverDecline,
} from '../../services/rideService';
import { addFavouriteDriver, removeFavouriteDriver, getFavouriteDrivers, isFavourite } from '../../services/favouriteDriversService';
import { analyticsEvents } from '../../services/analyticsService';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import CancelRideModal from '../../components/CancelRideModal';
import BiddingActivityBanner from '../../components/BiddingActivityBanner';
import DriverRankBadge from '../../components/DriverRankBadge';
import ProfileRegionFlag from '../../components/ProfileRegionFlag';
import { DEFAULT_JAMAICA_MAP_REGION } from '../../constants/mapRegionDefaults';
import * as Location from 'expo-location';
import {
  formatAddressFromExpoPlacemark,
  reverseGeocodeFormattedAddressAsync,
} from '../../services/reverseGeocodeService';
import { getRidePickupCoords, getRideDropoffCoords } from '../../utils/ridePickupCoords';
import { haversineKm } from '../../utils/haversine';
import NetInfo from '@react-native-community/netinfo';
import ConnectivityBanner from '../../components/ConnectivityBanner';
import {
  NEARBY_DRIVER_SEARCH_RADIUS_KM,
  mapRegionCloseOnPickup,
  mapRegionDeltasForSearchRadiusKm,
  RIDER_MAP_PRE_SCAN_ZOOM_MULTIPLIER,
  RIDE_REQUEST_SEARCH_ZOOM_IN_MS,
  RIDE_REQUEST_SEARCH_ZOOM_OUT_MS,
} from '../../utils/mapPickupSearchRegion';
import { fetchDrivingRouteThroughWaypoints, formatRoadDistanceKm } from '../../services/directionsPolylineService';
import {
  getRideFareBreakdownForRider,
  getVendorFoodItemsTotal,
  riderAllInFromDriverEarns,
} from '../../utils/rideFareBreakdown';
import {
  riderCardElevation,
  riderFloatingBarShadow,
  riderSuccessButtonLift,
} from '../../utils/riderUi';
import { buildMiddleWaypointLabels, buildOrderedRideRoutePoints, rideRoutePointsKey } from '../../utils/rideRouteWaypoints';
import { getFoodStopMapCoordinate } from '../../utils/foodStopCoords';
import { playRideRequestSound, playBidAcceptedSound } from '../../utils/appSounds';
import { notifyRiderNewBidLocal } from '../../services/notificationService';
import { REDEEM_DISCOUNT, REDEEM_RATE } from '../../services/iriCoinsService';

const PICKUP_DRIVER_SEARCH_RADIUS_M = NEARBY_DRIVER_SEARCH_RADIUS_KM * 1000;

/** Map bottom inset for the scanning pill inside the map area (sheet is separate; do not use sheet height here). */
const MAP_FLOATING_BOTTOM_CHROME = 100;

/** Handle strip height above the sheet ScrollView — keep in sync with `sheetHandleWrap` padding. */
const SHEET_HANDLE_SECTION_H = 26;

/** Plain "lat, lng" (or similar) typed as pickup/dropoff — treat as needing reverse geocode for map/callout. */
function looksLikeCoordOnlyLine(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return false;
  return /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/.test(t);
}

function bidDocTimeMs(b) {
  const c = b?.createdAt;
  if (c == null) return 0;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  return 0;
}

async function humanLineAtLatLng(lat, lng, textFallback) {
  const fb = String(textFallback || '').trim();
  if (fb && !looksLikeCoordOnlyLine(fb)) return fb;
  let line = await reverseGeocodeFormattedAddressAsync(lat, lng);
  if (line) return line;
  try {
    const rows = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    line = formatAddressFromExpoPlacemark(rows?.[0]);
    if (line) return line;
  } catch (_) {
    /* non-fatal */
  }
  return fb || '';
}

export default function BiddingScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const { t, formatJmdPrimary } = useLocale();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const {
    rideId,
    bidPrice,
    useRedeem,
    pickup,
    dropoff,
    foodStop,
    stops,
    pickupLatitude: pickupLatParam,
    pickupLongitude: pickupLngParam,
    dropoffLatitude: dropoffLatParam,
    dropoffLongitude: dropoffLngParam,
  } = route.params || {};
  const { userProfile, user } = useAuth();
  const styles = createStyles(theme, isDark);
  const [bids, setBids] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [counterOffers, setCounterOffers] = useState({});
  const [favourites, setFavourites] = useState(new Set());
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showNearbyDriversTitleBanner, setShowNearbyDriversTitleBanner] = useState(true);
  /** Driver new offer / counter (new bid doc) — toast at top */
  const [driverBidNotice, setDriverBidNotice] = useState(null);
  /** Per driverId → latest non–rider-counter bid doc id we’ve surfaced in the toast (avoids old docs overwriting new). */
  const prevLatestDriverBidIdByDriverRef = useRef(new Map());
  const bidNoticeTimerRef = useRef(null);
  const [nearbyMapHub, setNearbyMapHub] = useState(() => {
    const lat = pickupLatParam;
    const lng = pickupLngParam;
    if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { latitude: lat, longitude: lng };
    }
    return {
      latitude: DEFAULT_JAMAICA_MAP_REGION.latitude,
      longitude: DEFAULT_JAMAICA_MAP_REGION.longitude,
    };
  });
  const nearbyMapHubRef = useRef(nearbyMapHub);
  nearbyMapHubRef.current = nearbyMapHub;
  /** Bumps when MapView fires onMapReady — driver-search zoom must not run before native map exists. */
  const [biddingMapLayoutGen, setBiddingMapLayoutGen] = useState(0);
  /**
   * Match rider home: first paint tight on pickup (same as zoom-in keyframe), then effect animates out.
   * Wide initialRegion here made the camera look “stuck” if animateToRegion never ran.
   */
  const biddingMapInitialRegion = useMemo(() => {
    const lat = pickupLatParam;
    const lng = pickupLngParam;
    if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return {
        latitude: lat,
        longitude: lng,
        ...mapRegionCloseOnPickup(lat),
      };
    }
    return DEFAULT_JAMAICA_MAP_REGION;
  }, [pickupLatParam, pickupLngParam]);
  const sonarZoomRanForRideRef = useRef(null);
  const routeFitAppliedKeyRef = useRef('');
  const mapTopPadRef = useRef(88);
  const bidSummaryAnim = useRef(new Animated.Value(0)).current;
  const [biddingTripRoad, setBiddingTripRoad] = useState(null);
  const [rideDoc, setRideDoc] = useState(null);
  /** Worded addresses for map callouts (reverse geocode when pickup/drop text is lat,lng). */
  const [biddingMapLocationLines, setBiddingMapLocationLines] = useState({ pickup: '', dropoff: '', food: '' });
  /** Food vendor line in sheet when `vendorAddress` is missing (geocoded from pin). */
  const [foodStopGeoSheetLine, setFoodStopGeoSheetLine] = useState('');
  const [leadCardDismissed, setLeadCardDismissed] = useState(false);
  const [rejectedDriverIds, setRejectedDriverIds] = useState(() => new Set());
  const [isOffline, setIsOffline] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [biddingMapRemountKey, setBiddingMapRemountKey] = useState(0);

  useEffect(() => {
    if (!rideId) {
      setRideDoc(null);
      return undefined;
    }
    return subscribeToRide(rideId, setRideDoc);
  }, [rideId]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!(s?.isConnected ?? true)));
    return () => unsub();
  }, []);

  /** Ride left bidding — clear driver UI so banners/cards do not stick after cancel or accept. */
  useEffect(() => {
    const st = rideDoc?.status;
    if (!st || st === 'bidding') return;
    setBids([]);
    setDriverBidNotice(null);
    if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
    setLeadCardDismissed(false);
    setRejectedDriverIds(new Set());
  }, [rideDoc?.status]);

  /** When a driver declines (no counter), ride fare bumps so nearby drivers see a fresh offer. */
  useEffect(() => {
    if (!rideId) return undefined;
    return subscribeToDriverDeclinesForReissue(rideId, async () => {
      try {
        const next = await bumpRideBidAfterDriverDecline(rideId);
        if (next != null) {
          Alert.alert(
            t('riderBidding.offerUpdatedTitle'),
            t('riderBidding.offerUpdatedBody', { amount: formatJmdPrimary(next) }),
          );
        }
      } catch (e) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[Bidding] decline reissue bump', e);
        }
      }
    });
  }, [rideId, t, formatJmdPrimary]);

  const rideForFareBreakdown = useMemo(() => {
    const bp = Number(rideDoc?.bidPrice ?? bidPrice ?? 0) || 0;
    return {
      bidPrice: bp,
      finalFare: rideDoc?.finalFare,
      foodStop: rideDoc?.foodStop ?? foodStop ?? null,
      stopsFee: rideDoc?.stopsFee,
      stops: rideDoc?.stops,
    };
  }, [rideDoc, bidPrice, foodStop]);

  const riderFareBr = useMemo(() => getRideFareBreakdownForRider(rideForFareBreakdown), [rideForFareBreakdown]);

  const biddingRideForCoords = useMemo(() => {
    const base = {
      id: rideId,
      pickup: rideDoc?.pickup ?? pickup,
      dropoff: rideDoc?.dropoff ?? dropoff,
      stops: Array.isArray(rideDoc?.stops) ? rideDoc.stops : Array.isArray(stops) ? stops : [],
      foodStop: rideDoc?.foodStop ?? foodStop ?? null,
    };
    const pLat = rideDoc?.pickupLatitude ?? pickupLatParam;
    const pLng = rideDoc?.pickupLongitude ?? pickupLngParam;
    const dLat = rideDoc?.dropoffLatitude ?? dropoffLatParam;
    const dLng = rideDoc?.dropoffLongitude ?? dropoffLngParam;
    if (typeof pLat === 'number' && typeof pLng === 'number' && !Number.isNaN(pLat) && !Number.isNaN(pLng)) {
      base.pickupLatitude = pLat;
      base.pickupLongitude = pLng;
    }
    if (typeof dLat === 'number' && typeof dLng === 'number' && !Number.isNaN(dLat) && !Number.isNaN(dLng)) {
      base.dropoffLatitude = dLat;
      base.dropoffLongitude = dLng;
    }
    return base;
  }, [
    rideId,
    pickup,
    dropoff,
    rideDoc,
    foodStop,
    stops,
    pickupLatParam,
    pickupLngParam,
    dropoffLatParam,
    dropoffLngParam,
  ]);
  const biddingPickupLL = useMemo(() => {
    const c = getRidePickupCoords(biddingRideForCoords);
    return c && typeof c.lat === 'number' && typeof c.lng === 'number'
      ? { latitude: c.lat, longitude: c.lng }
      : null;
  }, [biddingRideForCoords]);
  const biddingDropLL = useMemo(() => {
    const c = getRideDropoffCoords(biddingRideForCoords);
    return c && typeof c.lat === 'number' && typeof c.lng === 'number'
      ? { latitude: c.lat, longitude: c.lng }
      : null;
  }, [biddingRideForCoords]);

  const biddingDriverSearchCenter = useMemo(
    () => biddingPickupLL || nearbyMapHub,
    [biddingPickupLL, nearbyMapHub],
  );

  const biddingRoutePoints = useMemo(() => buildOrderedRideRoutePoints(biddingRideForCoords), [biddingRideForCoords]);
  const biddingRoutePointsKey = useMemo(() => rideRoutePointsKey(biddingRoutePoints), [biddingRoutePoints]);
  const biddingMiddleLabels = useMemo(
    () => buildMiddleWaypointLabels(biddingRideForCoords),
    [biddingRideForCoords],
  );
  const biddingFoodStopMerged = useMemo(() => {
    if (!foodStop && !rideDoc?.foodStop) return null;
    const fromRoute = foodStop || {};
    const fromDoc = rideDoc?.foodStop || {};
    const merged = { ...fromRoute, ...fromDoc };
    const coordRoute = getFoodStopMapCoordinate(fromRoute);
    const coordDoc = getFoodStopMapCoordinate(fromDoc);
    const pick = coordDoc || coordRoute;
    if (pick) {
      merged.vendorLat = pick.latitude;
      merged.vendorLng = pick.longitude;
    }
    return merged;
  }, [foodStop, rideDoc?.foodStop]);

  /** Extra route stops (prefer Firestore ride doc once it exists). */
  const biddingStopsList = useMemo(() => {
    const fromDoc = Array.isArray(rideDoc?.stops) ? rideDoc.stops : [];
    const fromRoute = Array.isArray(stops) ? stops : [];
    const src = fromDoc.length > 0 ? fromDoc : fromRoute;
    return src
      .map((s) => (typeof s === 'string' ? s.trim() : String(s || '').trim()))
      .filter(Boolean);
  }, [rideDoc?.stops, stops]);

  const sheetPickupText = useMemo(() => {
    const t = (rideDoc?.pickup ?? pickup ?? '').trim();
    return t || 'Pickup';
  }, [rideDoc?.pickup, pickup]);
  const sheetDropoffText = useMemo(() => {
    const t = (rideDoc?.dropoff ?? dropoff ?? '').trim();
    return t || 'Destination';
  }, [rideDoc?.dropoff, dropoff]);

  const biddingVendorMapCoord = useMemo(
    () => (biddingFoodStopMerged ? getFoodStopMapCoordinate(biddingFoodStopMerged) : null),
    [biddingFoodStopMerged],
  );

  /** Separate "You" pin only when GPS is meaningfully away from pickup — avoids stacked duplicate markers on Android. */
  const showBiddingHubRiderMarker = useMemo(() => {
    if (!biddingPickupLL || !biddingDropLL) return true;
    const km = haversineKm(
      nearbyMapHub.latitude,
      nearbyMapHub.longitude,
      biddingPickupLL.latitude,
      biddingPickupLL.longitude,
    );
    return km > 0.075;
  }, [nearbyMapHub, biddingPickupLL, biddingDropLL]);

  const foodStopSheetSubline = useMemo(() => {
    const fs = biddingFoodStopMerged;
    if (!fs) return null;
    const addr = typeof fs.vendorAddress === 'string' ? fs.vendorAddress.trim() : '';
    if (addr) return addr;
    const g = String(foodStopGeoSheetLine ?? '').trim();
    return g || null;
  }, [biddingFoodStopMerged, foodStopGeoSheetLine]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lines = { pickup: '', dropoff: '', food: '' };
      let foodSheet = '';
      if (biddingPickupLL) {
        lines.pickup = await humanLineAtLatLng(
          biddingPickupLL.latitude,
          biddingPickupLL.longitude,
          sheetPickupText,
        );
      }
      if (biddingDropLL) {
        lines.dropoff = await humanLineAtLatLng(
          biddingDropLL.latitude,
          biddingDropLL.longitude,
          sheetDropoffText,
        );
      }
      const fs = biddingFoodStopMerged;
      const vCoord = biddingVendorMapCoord;
      const vAddr = fs && typeof fs.vendorAddress === 'string' ? fs.vendorAddress.trim() : '';
      if (vCoord && fs) {
        if (vAddr) {
          lines.food = vAddr;
          foodSheet = vAddr;
        } else {
          const g = await humanLineAtLatLng(vCoord.latitude, vCoord.longitude, '');
          lines.food = g;
          foodSheet = g;
        }
      }
      if (!cancelled) {
        setBiddingMapLocationLines(lines);
        setFoodStopGeoSheetLine(foodSheet);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    biddingPickupLL?.latitude,
    biddingPickupLL?.longitude,
    biddingDropLL?.latitude,
    biddingDropLL?.longitude,
    biddingVendorMapCoord?.latitude,
    biddingVendorMapCoord?.longitude,
    sheetPickupText,
    sheetDropoffText,
    biddingFoodStopMerged?.vendorAddress,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!biddingPickupLL || !biddingDropLL || biddingRoutePoints.length < 2) {
      setBiddingTripRoad(null);
      return undefined;
    }
    fetchDrivingRouteThroughWaypoints(biddingRoutePoints).then((res) => {
      if (!cancelled) setBiddingTripRoad(res?.coordinates?.length >= 2 ? res : null);
    });
    return () => {
      cancelled = true;
    };
  }, [biddingRoutePointsKey]);

  const biddingPolylineCoords = useMemo(() => {
    if (!biddingPickupLL || !biddingDropLL) return [];
    const seg = biddingTripRoad?.coordinates;
    if (seg && seg.length >= 2) return seg;
    if (biddingRoutePoints.length >= 2) return biddingRoutePoints;
    return [biddingPickupLL, biddingDropLL];
  }, [biddingPickupLL, biddingDropLL, biddingTripRoad, biddingRoutePoints]);

  const biddingRouteFitDepsKey = useMemo(() => {
    const roadN = biddingTripRoad?.coordinates?.length ?? 0;
    const polyN = biddingPolylineCoords.length;
    const mode = roadN >= 8 ? 'road' : 'simp';
    return `${rideId || ''}|${polyN}|${roadN}|${mode}`;
  }, [rideId, biddingPolylineCoords.length, biddingTripRoad?.coordinates?.length]);

  const biddingTripDistanceLabel = useMemo(() => {
    if (!biddingPickupLL || !biddingDropLL) return null;
    if (biddingTripRoad?.distanceMeters != null) return formatRoadDistanceKm(biddingTripRoad.distanceMeters);
    const km = haversineKm(
      biddingPickupLL.latitude,
      biddingPickupLL.longitude,
      biddingDropLL.latitude,
      biddingDropLL.longitude,
    );
    return `~${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }, [biddingTripRoad, biddingPickupLL, biddingDropLL]);

  useEffect(() => {
    setShowNearbyDriversTitleBanner(true);
  }, [rideId]);

  useEffect(() => {
    bidSummaryAnim.setValue(0);
    Animated.timing(bidSummaryAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rideId, bidSummaryAnim]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setNearbyMapHub({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      } catch (_) {
        /* keep default hub */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userProfile?.id) getFavouriteDrivers(userProfile.id).then((list) => setFavourites(new Set((list || []).map((d) => d.id)))).catch(() => {});
  }, [userProfile?.id]);

  useEffect(() => {
    if (!rideId) return () => {};
    const unsub = subscribeToBids(rideId, setBids);
    return unsub;
  }, [rideId]);

  const latestRiderCounterByDriverId = useMemo(() => {
    const m = new Map();
    for (const b of bids) {
      if (!b.riderCounter) continue;
      const did = String(b.driverId ?? '');
      if (!did) continue;
      const prev = m.get(did);
      if (!prev || bidDocTimeMs(b) >= bidDocTimeMs(prev)) m.set(did, b);
    }
    return m;
  }, [bids]);

  /** Latest driver bid doc per driver (by createdAt), so UI & toasts never stick on an older offer. */
  const latestDriverBidByDriverId = useMemo(() => {
    const m = new Map();
    for (const b of bids) {
      if (b.riderCounter || !b.driverId) continue;
      const did = String(b.driverId);
      const prev = m.get(did);
      if (!prev || bidDocTimeMs(b) >= bidDocTimeMs(prev)) m.set(did, b);
    }
    return m;
  }, [bids]);

  const displayDriversRaw = useMemo(() => {
    if (rideDoc?.status && rideDoc.status !== 'bidding') return [];
    if (!bids.length) return [];
    const uniqueBids = [...latestDriverBidByDriverId.values()].sort(
      (a, b) => bidDocTimeMs(b) - bidDocTimeMs(a),
    );
    return uniqueBids.map((b) => {
      const rc = latestRiderCounterByDriverId.get(String(b.driverId));
      const n = rc != null ? Number(rc.price ?? rc.counterPrice) : NaN;
      return {
        ...b,
        id: b.driverId,
        bidDocId: b.id,
        name: b.driverName,
        riderCounterPrice: Number.isFinite(n) && n > 0 ? n : null,
      };
    });
  }, [bids, rideDoc?.status, latestRiderCounterByDriverId, latestDriverBidByDriverId]);

  const visibleDrivers = useMemo(
    () => displayDriversRaw.filter((d) => !rejectedDriverIds.has(String(d.id))),
    [displayDriversRaw, rejectedDriverIds],
  );

  const driverIdsKey = useMemo(
    () => visibleDrivers.map((d) => d.id).filter(Boolean).sort().join('|'),
    [visibleDrivers]
  );

  const profileCache = useRef({});
  const [profileTick, setProfileTick] = useState(0);
  const biddingMapRef = useRef(null);

  useEffect(() => {
    profileCache.current = {};
    prevLatestDriverBidIdByDriverRef.current = new Map();
    setProfileTick((t) => t + 1);
  }, [rideId]);

  useEffect(() => {
    if (!driverIdsKey) return;
    let cancelled = false;
    const ids = driverIdsKey.split('|').filter(Boolean);
    (async () => {
      await Promise.all(
        ids.map(async (id) => {
          if (profileCache.current[id]?.loaded) return;
          try {
            const p = await getUserProfile(id);
            if (cancelled) return;
            profileCache.current[id] = {
              loaded: true,
              photoURL: p?.photoURL || p?.photoUrl || null,
              licensePlate: p?.licensePlate || '',
              vehicle: p?.vehicle || '',
              rating: typeof p?.rating === 'number' ? p.rating : null,
              driverCompletedRides: typeof p?.driverCompletedRides === 'number' ? p.driverCompletedRides : 0,
              profileRegionCode: p?.profileRegionCode || null,
            };
          } catch (e) {
            if (!cancelled) profileCache.current[id] = { loaded: true };
          }
        })
      );
      if (!cancelled) setProfileTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [driverIdsKey]);

  /** Load driver photos as soon as bid docs exist (don’t wait for displayDrivers dedupe). */
  useEffect(() => {
    if (!bids.length) return;
    let cancelled = false;
    const ids = [...new Set(bids.filter((b) => !b.riderCounter && b.driverId).map((b) => String(b.driverId)))];
    (async () => {
      await Promise.all(
        ids.map(async (id) => {
          if (profileCache.current[id]?.loaded) return;
          try {
            const p = await getUserProfile(id);
            if (cancelled) return;
            profileCache.current[id] = {
              loaded: true,
              photoURL: p?.photoURL || p?.photoUrl || null,
              licensePlate: p?.licensePlate || '',
              vehicle: p?.vehicle || '',
              rating: typeof p?.rating === 'number' ? p.rating : null,
              driverCompletedRides: typeof p?.driverCompletedRides === 'number' ? p.driverCompletedRides : 0,
              profileRegionCode: p?.profileRegionCode || null,
            };
          } catch (e) {
            if (!cancelled) profileCache.current[id] = { loaded: true };
          }
        }),
      );
      if (!cancelled) setProfileTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [bids]);

  useEffect(() => {
    if (!rideId) return;
    if (!bids.length) {
      prevLatestDriverBidIdByDriverRef.current = new Map();
      return;
    }
    const prevSnap = prevLatestDriverBidIdByDriverRef.current;
    let newestChange = null;
    let newestT = -1;
    for (const [, latest] of latestDriverBidByDriverId) {
      const did = String(latest.driverId);
      const prevId = prevSnap.get(did);
      if (prevId === latest.id) continue;
      const t = bidDocTimeMs(latest);
      if (t >= newestT) {
        newestT = t;
        newestChange = latest;
      }
    }
    prevLatestDriverBidIdByDriverRef.current = new Map(
      [...latestDriverBidByDriverId.entries()].map(([did, latest]) => [String(did), latest.id]),
    );
    if (!newestChange) return;
    const b = newestChange;
    const did = String(b.driverId);
    /** Follow-up bid from a driver already in the thread — lead card updates live; skip duplicate toast. */
    const hadPriorBidFromDriver = prevSnap.has(did);

    if (!hadPriorBidFromDriver) {
      playRideRequestSound().catch(() => {});
      const name = b.driverName || 'Driver';
      const driverTrip = Math.max(0, Math.round(Number(b.price ?? b.counterPrice ?? 0) || 0));
      const rideForNotice = { foodStop: rideDoc?.foodStop ?? foodStop ?? null };
      const vendorFood = getVendorFoodItemsTotal(rideForNotice);
      const riderPaysTotal = riderAllInFromDriverEarns(rideForNotice, driverTrip);
      const prof = profileCache.current[did];
      const uri = prof?.photoURL || prof?.photoUrl || null;
      if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
      const subLines = [
        t('riderBidding.bidNoticeDriverShare', { amount: formatJmdPrimary(driverTrip) }),
      ];
      if (vendorFood > 0) {
        subLines.push(t('riderBidding.bidNoticeFoodVendor', { amount: formatJmdPrimary(vendorFood) }));
        subLines.push(t('riderBidding.bidNoticeYourTotal', { amount: formatJmdPrimary(riderPaysTotal) }));
      } else {
        subLines.push(
          t('riderBidding.bidNoticeYourTotalNoFood', { amount: formatJmdPrimary(riderPaysTotal) }),
        );
      }
      subLines.push(t('riderBidding.bidNoticeCta'));
      setDriverBidNotice({
        bidDocId: b.id,
        driverId: did,
        title: t('riderBidding.bidNoticeHeadline', { name }),
        subtitle: subLines.join('\n'),
        uri,
      });
      getUserProfile(did)
        .then((p) => {
          const u = p?.photoURL || p?.photoUrl || null;
          profileCache.current[did] = {
            loaded: true,
            photoURL: u,
            licensePlate: p?.licensePlate || '',
            vehicle: p?.vehicle || '',
            rating: typeof p?.rating === 'number' ? p.rating : null,
          };
          setProfileTick((t) => t + 1);
          setDriverBidNotice((prev) => (prev?.bidDocId === b.id ? { ...prev, uri: u } : prev));
        })
        .catch(() => {});
      bidNoticeTimerRef.current = setTimeout(() => setDriverBidNotice(null), 9000);
      if (AppState.currentState !== 'active') {
        notifyRiderNewBidLocal({
          title: t('riderBidding.bidNoticeHeadline', { name: b.driverName || 'Driver' }),
          body: t('riderBidding.bidNoticeDriverShare', { amount: formatJmdPrimary(driverTrip) }),
          rideId,
        }).catch(() => {});
      }
    } else {
      playRideRequestSound().catch(() => {});
      if (AppState.currentState !== 'active') {
        const driverTripUpd = Math.max(0, Math.round(Number(b.price ?? b.counterPrice ?? 0) || 0));
        notifyRiderNewBidLocal({
          title: t('riderBidding.bidNoticeHeadline', { name: b.driverName || 'Driver' }),
          body: t('riderBidding.bidNoticeDriverShare', { amount: formatJmdPrimary(driverTripUpd) }),
          rideId,
        }).catch(() => {});
      }
      getUserProfile(did)
        .then((p) => {
          const u = p?.photoURL || p?.photoUrl || null;
          profileCache.current[did] = {
            loaded: true,
            photoURL: u,
            licensePlate: p?.licensePlate || '',
            vehicle: p?.vehicle || '',
            rating: typeof p?.rating === 'number' ? p.rating : null,
          };
          setProfileTick((t) => t + 1);
        })
        .catch(() => {});
    }
  }, [
    bids,
    rideId,
    bidPrice,
    latestDriverBidByDriverId,
    rideDoc?.foodStop,
    foodStop,
    t,
    formatJmdPrimary,
  ]);

  useEffect(
    () => () => {
      if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
    },
    [],
  );

  const getFareForDriver = (driver) => {
    const counter = counterOffers[driver.id]?.trim();
    const counterNum = counter ? parseInt(counter, 10) : NaN;
    if (!isNaN(counterNum) && counterNum > 0) return counterNum;
    const rc = driver.riderCounterPrice;
    if (rc != null && Number(rc) > 0) return Number(rc);
    return driver.counterPrice || driver.price || bidPrice;
  };

  const acceptBid = (driver) => {
    setSelectedDriver(driver);
    const fare = getFareForDriver(driver);
    const isCounter = fare !== (driver.counterPrice || driver.price || bidPrice);
    const fareDisp = formatJmdPrimary(fare);
    Alert.alert(
      t('riderBidding.acceptBidTitle'),
      isCounter
        ? t('riderBidding.acceptAtCounter', { amount: fareDisp })
        : t('riderBidding.acceptDriverOffer', { name: driver.name, amount: fareDisp }),
      [
        { text: t('driverDashboard.cancel'), style: 'cancel' },
        {
          text: t('riderBidding.accept'),
          onPress: () => {
            if (rideId) {
              (async () => {
                try {
                  const riderUid = resolveAuthUid(user, userProfile);
                  if (!riderUid) {
                    Alert.alert(t('riderBidding.notSignedInTitle'), t('riderBidding.notSignedAccept'));
                    return;
                  }
                  const ride = await getRideById(rideId);
                  if (!ride) {
                    Alert.alert(t('alerts.errorTitle'), t('riderBidding.rideNotFound'));
                    return;
                  }
                  if (String(ride.riderId) !== String(riderUid)) {
                    Alert.alert(t('riderBidding.wrongAccountTitle'), t('riderBidding.wrongAccountAcceptBody'));
                    return;
                  }
                  await updateRide(rideId, {
                    status: 'accepted',
                    driverId: String(driver.id),
                    driverName: driver.name || 'Driver',
                    finalFare: fare,
                  });
                  playBidAcceptedSound().catch(() => {});
                  analyticsEvents.rideAccepted(rideId, driver.id, fare);
                  navigation.navigate('ActiveRide', {
                    rideId,
                    driver,
                    fare,
                    useRedeem,
                    pickup,
                    dropoff,
                    foodStop: foodStop || undefined,
                    stops: Array.isArray(ride.stops) ? ride.stops : Array.isArray(stops) ? stops : [],
                  });
                } catch (e) {
                  const msg =
                    e?.code === 'permission-denied'
                      ? t('riderBidding.acceptErrorFirestore')
                      : e.message || t('riderBidding.acceptErrorGeneric');
                  Alert.alert(t('alerts.errorTitle'), msg);
                }
              })();
            } else {
              Alert.alert(t('alerts.errorTitle'), t('riderBidding.rideNotFound'));
            }
          },
        },
      ]
    );
  };

  /** Match list logic: rider-only bids / malformed bids still leave driver list empty — must show scanning UI. */
  const showEmptyState = visibleDrivers.length === 0;

  const sendCounter = async (driver) => {
    const counter = counterOffers[driver.id]?.trim();
    const counterNum = counter ? parseInt(counter, 10) : NaN;
    if (isNaN(counterNum) || counterNum < 1) {
      Alert.alert(
        t('riderBidding.invalidCounterTitle'),
        t('riderBidding.invalidCounter', { currency: 'JMD' }),
      );
      return;
    }
    if (!rideId) {
      Alert.alert(t('alerts.errorTitle'), t('riderBidding.rideNotFound'));
      return;
    }
    const riderUid = resolveAuthUid(user, userProfile);
    if (!riderUid) {
      Alert.alert(t('riderBidding.notSignedInTitle'), t('riderBidding.notSignedCounter'));
      return;
    }
    try {
      const ride = await getRideById(rideId);
      if (!ride) {
        Alert.alert(t('alerts.errorTitle'), t('riderBidding.rideNotFound'));
        return;
      }
      if (String(ride.riderId) !== String(riderUid)) {
        Alert.alert(t('riderBidding.wrongAccountTitle'), t('riderBidding.wrongAccountCounterBody'));
        return;
      }
      const anchor = latestDriverBidByDriverId.get(String(driver.id));
      if (!anchor?.id) {
        Alert.alert(t('riderBidding.noDriverBidToCounterTitle'), t('riderBidding.noDriverBidToCounterBody'));
        return;
      }
      await addBid(rideId, {
        riderCounter: true,
        driverId: String(driver.id),
        counterToBidId: anchor.id,
        driverName: driver.name,
        price: counterNum,
        counterPrice: counterNum,
        riderId: String(riderUid),
      });
      Alert.alert(
        t('riderBidding.counterSent'),
        t('riderBidding.counterSentBody', {
          amount: formatJmdPrimary(counterNum),
          name: driver.name,
        }),
      );
      setCounterOffers((prev) => ({ ...prev, [driver.id]: '' }));
    } catch (e) {
      const raw = (e?.message || '').toLowerCase();
      const msg =
        e?.code === 'permission-denied' || raw.includes('permission')
          ? t('riderBidding.counterErrorFirestore')
          : e.message || t('riderBidding.counterErrorGeneric');
      Alert.alert(t('alerts.errorTitle'), msg);
    }
  };

  const handleCancelRide = (reason) => {
    setShowCancelModal(false);
    if (!rideId) {
      Alert.alert(t('alerts.errorTitle'), t('riderBidding.rideNotFound'));
      navigation.goBack();
      return;
    }
    setBids([]);
    setDriverBidNotice(null);
    if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
    setLeadCardDismissed(false);
    setRejectedDriverIds(new Set());
    cancelRide(rideId, reason, 'rider')
      .then(() => {
        analyticsEvents.rideCancelled(rideId, reason, 'rider');
        Alert.alert(t('riderBidding.cancelledTitle'), t('riderBidding.cancelledBody'));
        navigation.goBack();
      })
      .catch((e) => Alert.alert(t('alerts.errorTitle'), e.message || t('riderBidding.cancelError')));
  };

  const renderDriverCard = (item, { hideBiddingRow = false } = {}) => {
    const prof = profileCache.current[item.id] || { loaded: false };
    const ratingShow = prof.rating ?? item.rating ?? 4.8;
    const vehicleLine = [prof.vehicle, prof.licensePlate ? `· ${prof.licensePlate}` : '']
      .filter(Boolean)
      .join(' ')
      .trim();
    return (
      <View style={styles.card} key={item.bidDocId || String(item.id)}>
        <View style={styles.cardTopRow}>
          {prof.photoURL || prof.photoUrl ? (
            <Image source={{ uri: prof.photoURL || prof.photoUrl }} style={styles.driverAvatar} />
          ) : (
            <View style={[styles.driverAvatar, styles.driverAvatarPlaceholder]}>
              <Ionicons name="person" size={28} color={theme.colors.primary} />
            </View>
          )}
          <View style={styles.cardTopText}>
            <View style={styles.cardHeader}>
              <Text style={styles.driverName}>{item.name}</Text>
              <View style={styles.cardHeaderRight}>
                {(ratingShow >= 4.8 || item.idVerified) && (
                  <View style={styles.badges}>
                    {item.idVerified && <Text style={styles.badge}>✓ ID</Text>}
                    {ratingShow >= 4.8 && <Text style={styles.badge}>★ Top</Text>}
                  </View>
                )}
                <Text style={styles.rating}>⭐ {Number(ratingShow).toFixed(1)}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    const fav = favourites.has(item.id);
                    if (fav) {
                      await removeFavouriteDriver(userProfile?.id, item.id);
                      setFavourites((s) => {
                        const n = new Set(s);
                        n.delete(item.id);
                        return n;
                      });
                    } else {
                      await addFavouriteDriver(userProfile?.id, item);
                      setFavourites((s) => new Set([...s, item.id]));
                    }
                  }}
                >
                  <Ionicons
                    name={favourites.has(item.id) ? 'heart' : 'heart-outline'}
                    size={22}
                    color={favourites.has(item.id) ? theme.colors.error : theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>
            {vehicleLine ? (
              <Text style={styles.vehicleMeta} numberOfLines={2}>
                {vehicleLine}
              </Text>
            ) : null}
            <View style={styles.rankRegionRow}>
              <DriverRankBadge
                completedRides={prof.driverCompletedRides}
                theme={theme}
              />
              <ProfileRegionFlag code={prof.profileRegionCode} theme={theme} />
            </View>
          </View>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatJmdPrimary(item.counterPrice || item.price || bidPrice + 200)}
          </Text>
          {(counterOffers[item.id]?.trim() || item.riderCounterPrice) && (
            <Text style={styles.counterLabel}>
              {t('riderBidding.counterYourLine', {
                amount: formatJmdPrimary(
                  Number(
                    counterOffers[item.id]?.trim()
                      ? parseInt(counterOffers[item.id], 10) || counterOffers[item.id]
                      : item.riderCounterPrice,
                  ) || 0,
                ),
              })}
            </Text>
          )}
        </View>
        {hideBiddingRow ? (
          <Text style={[styles.leadDriverListHint, { color: theme.colors.textSecondary }]}>
            {t('riderBidding.leadListHint')}
          </Text>
        ) : (
          <View style={styles.actions}>
            <ThemedTextInput
              style={styles.counterInput}
              placeholder={t('riderBidding.counterPh', { currency: 'JMD' })}
              value={counterOffers[item.id] || ''}
              onChangeText={(v) => setCounterOffers((prev) => ({ ...prev, [item.id]: v }))}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[styles.counterBtn, !counterOffers[item.id]?.trim() && styles.counterBtnDisabled]}
              onPress={() => sendCounter(item)}
              disabled={!counterOffers[item.id]?.trim()}
            >
              <Text style={styles.counterBtnText}>{t('riderBidding.send')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptBid(item)}>
              <Text style={styles.acceptText}>{t('riderBidding.accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtnOutline}
              onPress={() => {
                setRejectedDriverIds((prev) => new Set(prev).add(String(item.id)));
              }}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={t('riderBidding.decline')}
            >
              <Text style={styles.rejectBtnOutlineText}>{t('riderBidding.decline')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  /** Cap sheet height so the map stays primary; list scrolls inside. */
  const bottomSheetMaxH = Math.min(Math.round(windowHeight * 0.3), 268);
  const sheetScrollMaxH = Math.max(160, bottomSheetMaxH - SHEET_HANDLE_SECTION_H);

  /**
   * After the sonar camera animation, fit the route polyline so the orange path is not clipped
   * (camera was pickup-centric ~1 km while trips can be much longer). Re-fit when directions return a detailed road.
   */
  useEffect(() => {
    if (!rideId || biddingMapLayoutGen === 0 || biddingPolylineCoords.length < 2) return undefined;
    const hasDetailedRoad = (biddingTripRoad?.coordinates?.length ?? 0) >= 8;
    const delay = hasDetailedRoad
      ? Platform.OS === 'android'
        ? 420
        : 280
      : RIDE_REQUEST_SEARCH_ZOOM_IN_MS + RIDE_REQUEST_SEARCH_ZOOM_OUT_MS + 320;
    const key = biddingRouteFitDepsKey;
    const coords = biddingPolylineCoords;
    const t = setTimeout(() => {
      if (routeFitAppliedKeyRef.current === key) return;
      const map = biddingMapRef.current;
      if (!map || typeof map.fitToCoordinates !== 'function') return;
      routeFitAppliedKeyRef.current = key;
      try {
        const topPad = mapTopPadRef.current;
        map.fitToCoordinates(coords, {
          edgePadding: {
            top: topPad + 28,
            right: 20,
            bottom: MAP_FLOATING_BOTTOM_CHROME + bottomSheetMaxH + 16,
            left: 20,
          },
          animated: true,
        });
      } catch (_) {
        routeFitAppliedKeyRef.current = '';
      }
    }, delay);
    return () => clearTimeout(t);
  }, [
    rideId,
    biddingMapLayoutGen,
    biddingRouteFitDepsKey,
    biddingTripRoad?.coordinates?.length,
    bottomSheetMaxH,
  ]);

  useEffect(() => {
    sonarZoomRanForRideRef.current = null;
    routeFitAppliedKeyRef.current = '';
  }, [rideId]);

  /**
   * Same driver-search zoom as rider home: tight on pickup, then ease out via
   * {@link mapRegionDeltasForSearchRadiusKm}. Runs after native map is ready; guard ref only once anim can run.
   */
  useEffect(() => {
    if (!rideId || !biddingPickupLL) return undefined;
    if (biddingMapLayoutGen === 0) return undefined;
    if (sonarZoomRanForRideRef.current === rideId) return undefined;

    let cancelled = false;
    const readyDelay = Platform.OS === 'android' ? 320 : 180;

    const run = async () => {
      await new Promise((r) => setTimeout(r, readyDelay));
      if (cancelled) return;
      const map = biddingMapRef.current;
      if (!map || typeof map.animateToRegion !== 'function') return;

      sonarZoomRanForRideRef.current = rideId;

      const { latitude, longitude } = biddingPickupLL;
      const close = { latitude, longitude, ...mapRegionCloseOnPickup(latitude) };
      const zoomed = {
        latitude,
        longitude,
        ...mapRegionDeltasForSearchRadiusKm(latitude),
      };
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Armada/map] Bidding pre-scan → search', {
          rideId,
          multiplier: RIDER_MAP_PRE_SCAN_ZOOM_MULTIPLIER,
          preScanDeltas: { latitudeDelta: close.latitudeDelta, longitudeDelta: close.longitudeDelta },
          searchDeltas: { latitudeDelta: zoomed.latitudeDelta, longitudeDelta: zoomed.longitudeDelta },
          center: { latitude, longitude },
        });
      }

      await new Promise((resolve) => {
        map.animateToRegion(close, RIDE_REQUEST_SEARCH_ZOOM_IN_MS);
        setTimeout(resolve, RIDE_REQUEST_SEARCH_ZOOM_IN_MS + 100);
      });
      if (cancelled) return;
      await new Promise((resolve) => {
        map.animateToRegion(zoomed, RIDE_REQUEST_SEARCH_ZOOM_OUT_MS);
        setTimeout(resolve, RIDE_REQUEST_SEARCH_ZOOM_OUT_MS + 200);
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [rideId, biddingPickupLL?.latitude, biddingPickupLL?.longitude, biddingMapLayoutGen]);

  const hasDriverResponses = visibleDrivers.length > 0;
  const leadSlotDriver = hasDriverResponses ? visibleDrivers[0] : null;
  const leadDriver = leadSlotDriver && !leadCardDismissed ? leadSlotDriver : null;

  useEffect(() => {
    setLeadCardDismissed(false);
  }, [leadSlotDriver?.id, leadSlotDriver?.bidDocId]);

  void profileTick;
  const leadProf = leadDriver ? profileCache.current[leadDriver.id] || {} : {};
  const leadVehicleLine = leadDriver
    ? [leadProf.vehicle, leadProf.licensePlate ? `· ${leadProf.licensePlate}` : ''].filter(Boolean).join(' ').trim()
    : '';
  const leadRatingShow =
    leadDriver != null ? leadProf.rating ?? leadDriver.rating ?? 4.8 : null;

  /** Driver’s latest trip & fees from the live bid doc (not merged with your counter). */
  const leadCardTotals = useMemo(() => {
    if (!leadDriver) return null;
    const driverTrip = Math.max(
      0,
      Math.round(Number(leadDriver.counterPrice ?? leadDriver.price ?? 0) || 0),
    );
    if (driverTrip <= 0) return null;
    const rideForNotice = { foodStop: rideDoc?.foodStop ?? foodStop ?? null };
    const vendorFood = getVendorFoodItemsTotal(rideForNotice);
    const riderPaysTotal = riderAllInFromDriverEarns(rideForNotice, driverTrip);
    return { driverTrip, vendorFood, riderPaysTotal };
  }, [leadDriver, rideDoc?.foodStop, foodStop]);

  const leadPendingCounterRaw = leadDriver ? String(counterOffers[leadDriver.id] || '').trim() : '';
  const leadPendingCounterParsed = leadPendingCounterRaw ? parseInt(leadPendingCounterRaw, 10) : NaN;
  const leadPendingCounterNum =
    !Number.isNaN(leadPendingCounterParsed) && leadPendingCounterParsed > 0
      ? leadPendingCounterParsed
      : null;
  const leadDisplayRiderCounterAmount =
    leadPendingCounterNum ??
    (leadDriver?.riderCounterPrice != null && Number(leadDriver.riderCounterPrice) > 0
      ? Number(leadDriver.riderCounterPrice)
      : null);

  /** Clear floating back row on map overlay */
  const TOP_BELOW_BACK_ROW = 44;
  const topNoticeApprox = driverBidNotice ? 72 : 0;
  const topCardApprox = leadDriver ? 320 : 0;
  const topStackGap = driverBidNotice && leadDriver ? 8 : 0;
  const topStackBody = topNoticeApprox + topStackGap + topCardApprox;
  const mapTopPad = insets.top + TOP_BELOW_BACK_ROW + (topStackBody > 0 ? topStackBody + 10 : 8);
  mapTopPadRef.current = mapTopPad;

  return (
    <View style={styles.container}>
      <View
        style={[styles.biddingTopBanner, { top: insets.top + TOP_BELOW_BACK_ROW, left: 12, right: 12 }]}
        pointerEvents="box-none"
      >
        <ConnectivityBanner
          isOffline={isOffline}
          mapLoadFailed={mapLoadFailed}
          firebaseReady={isFirebaseReady}
          onRetry={() => {
            setMapLoadFailed(false);
            NetInfo.fetch();
            setBiddingMapRemountKey((k) => k + 1);
          }}
          style={{ marginBottom: 8 }}
        />
        {driverBidNotice ? (
          <BiddingActivityBanner
            visible
            title={driverBidNotice?.title}
            subtitle={driverBidNotice?.subtitle}
            imageUri={driverBidNotice?.uri}
            theme={theme}
            onDismiss={() => {
              if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
              setDriverBidNotice(null);
            }}
          />
        ) : null}
        {leadDriver ? (
          <View
            style={[
              styles.driverAcceptedTopCard,
              {
                marginTop: driverBidNotice ? 8 : 0,
                backgroundColor: isDark ? theme.colors.card : theme.colors.surface,
                borderColor: theme.colors.primary + (isDark ? '55' : '99'),
              },
            ]}
          >
            <View style={styles.driverAcceptedTopHeaderRow}>
              <View style={styles.driverAcceptedTopBadgeRow}>
                <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                <Text style={[styles.driverAcceptedTopBadgeText, { color: theme.colors.success }]}>
                  {visibleDrivers.length === 1
                    ? t('riderBidding.driverResponseSingle')
                    : t('riderBidding.driverResponseLatest')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.driverAcceptedTopCloseBtn, { borderColor: theme.colors.primaryLight + 'CC' }]}
                onPress={() => setLeadCardDismissed(true)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Close driver card"
              >
                <Text style={[styles.driverAcceptedTopCloseBtnText, { color: theme.colors.textSecondary }]}>
                  {t('common.close')}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.driverAcceptedTopMainRow}>
              {leadProf.photoURL || leadProf.photoUrl ? (
                <Image
                  source={{ uri: leadProf.photoURL || leadProf.photoUrl }}
                  style={styles.driverAcceptedTopAvatar}
                />
              ) : (
                <View style={[styles.driverAcceptedTopAvatar, styles.driverAcceptedTopAvatarPh]}>
                  <Ionicons name="person" size={26} color={theme.colors.primary} />
                </View>
              )}
              <View style={styles.driverAcceptedTopTextCol}>
                <Text style={[styles.driverAcceptedTopName, { color: theme.colors.text }]} numberOfLines={1}>
                  {leadDriver.name || 'Driver'}
                </Text>
                {leadCardTotals ? (
                  <View
                    style={[
                      styles.driverAcceptedOfferBlock,
                      {
                        backgroundColor: isDark ? 'rgba(124, 58, 237, 0.14)' : 'rgba(124, 58, 237, 0.09)',
                        borderColor: theme.colors.primary + (isDark ? '44' : '33'),
                      },
                    ]}
                  >
                    <Text
                      style={[styles.driverAcceptedTheirLabel, { color: theme.colors.textSecondary }]}
                    >
                      {t('riderBidding.theirOfferLabel')}
                    </Text>
                    <Text style={[styles.driverAcceptedTopOfferHero, { color: theme.colors.text }]}>
                      {formatJmdPrimary(leadCardTotals.driverTrip)}
                    </Text>
                    {leadCardTotals.vendorFood > 0 ? (
                      <>
                        <Text
                          style={[styles.driverAcceptedFareSub, { color: theme.colors.textSecondary }]}
                          numberOfLines={2}
                        >
                          {t('riderBidding.bidNoticeFoodVendor', {
                            amount: formatJmdPrimary(leadCardTotals.vendorFood),
                          })}
                        </Text>
                        <Text style={[styles.driverAcceptedFareSubBold, { color: theme.colors.text }]}>
                          {t('riderBidding.bidNoticeYourTotal', {
                            amount: formatJmdPrimary(leadCardTotals.riderPaysTotal),
                          })}
                        </Text>
                      </>
                    ) : (
                      <Text
                        style={[styles.driverAcceptedFareSub, { color: theme.colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {t('riderBidding.bidNoticeYourTotalNoFood', {
                          amount: formatJmdPrimary(leadCardTotals.riderPaysTotal),
                        })}
                      </Text>
                    )}
                  </View>
                ) : null}
                {leadVehicleLine ? (
                  <Text
                    style={[styles.driverAcceptedTopMeta, { color: theme.colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {leadVehicleLine}
                  </Text>
                ) : null}
                <Text style={[styles.driverAcceptedTopMeta, { color: theme.colors.textSecondary }]}>
                  ⭐ {Number(leadRatingShow).toFixed(1)}
                  {leadDriver.idVerified ? ' · ✓ ID verified' : ''}
                </Text>
              </View>
            </View>
            {visibleDrivers.length > 1 ? (
              <Text style={[styles.driverAcceptedTopMore, { color: theme.colors.primary }]}>
                {t('riderBidding.leadMoreDrivers', { n: visibleDrivers.length - 1 })}
              </Text>
            ) : (
              <Text style={[styles.driverAcceptedTopMore, { color: theme.colors.textSecondary }]}>
                {t('riderBidding.leadCounterHere')}
              </Text>
            )}
            {leadDisplayRiderCounterAmount != null ? (
              <View
                style={[
                  styles.driverAcceptedYourCounterBlock,
                  {
                    borderColor: theme.colors.primary + (isDark ? 'AA' : '99'),
                    backgroundColor: isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(250, 204, 21, 0.22)',
                  },
                ]}
              >
                <Text
                  style={[styles.driverAcceptedYourCounterTitle, { color: theme.colors.textSecondary }]}
                >
                  {t('riderBidding.yourCounterTitle')}
                </Text>
                <Text style={[styles.driverAcceptedYourCounterAmount, { color: theme.colors.text }]}>
                  {formatJmdPrimary(leadDisplayRiderCounterAmount)}
                </Text>
              </View>
            ) : null}
            <View
              style={[
                styles.driverAcceptedTopBidding,
                { borderTopColor: theme.colors.primaryLight + '66' },
              ]}
            >
              <Text style={[styles.driverAcceptedTopBiddingLabel, { color: theme.colors.textSecondary }]}>
                {t('riderBidding.counterPh', { currency: 'JMD' })}
              </Text>
              <ThemedTextInput
                style={[
                  styles.driverAcceptedTopCounterInput,
                  {
                    borderColor: theme.colors.primaryLight,
                    backgroundColor: theme.colors.background,
                    color: theme.colors.text,
                  },
                ]}
                placeholder={t('riderBidding.counterExamplePh')}
                placeholderTextColor={theme.colors.textSecondary}
                value={counterOffers[leadDriver.id] || ''}
                onChangeText={(v) => setCounterOffers((prev) => ({ ...prev, [leadDriver.id]: v }))}
                keyboardType="number-pad"
                accessibilityLabel={t('riderBidding.counterInputJmdHint')}
              />
              <View style={styles.driverAcceptedTopBidActions}>
                <TouchableOpacity
                  style={[
                    styles.driverAcceptedTopSendBtn,
                    !counterOffers[leadDriver.id]?.trim() && styles.driverAcceptedTopSendBtnDisabled,
                  ]}
                  onPress={() => sendCounter(leadDriver)}
                  disabled={!counterOffers[leadDriver.id]?.trim()}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.driverAcceptedTopSendBtnText,
                      !counterOffers[leadDriver.id]?.trim() && styles.driverAcceptedTopSendBtnTextDisabled,
                    ]}
                  >
                    {t('riderBidding.sendCounter')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.driverAcceptedTopAcceptBtn, { backgroundColor: theme.colors.success }]}
                  onPress={() => acceptBid(leadDriver)}
                  activeOpacity={0.88}
                >
                  <Text style={styles.acceptText}>{t('riderBidding.accept')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.driverAcceptedTopDeclineBtn}
                onPress={() => {
                  if (!leadSlotDriver) return;
                  const id = String(leadSlotDriver.id);
                  setRejectedDriverIds((prev) => new Set(prev).add(id));
                  setLeadCardDismissed(true);
                  setDriverBidNotice(null);
                  if (bidNoticeTimerRef.current) clearTimeout(bidNoticeTimerRef.current);
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('riderBidding.declineDriverA11y')}
              >
                <Text style={styles.driverAcceptedTopDeclineBtnText}>
                  {t('riderBidding.declineDriverBtn')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.mapShell} collapsable={false}>
        <MapView
          key={`bidding-map-${biddingMapRemountKey}`}
          ref={biddingMapRef}
          style={styles.mapFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={biddingMapInitialRegion}
          onMapReady={() => setBiddingMapLayoutGen((n) => n + 1)}
          onError={() => setMapLoadFailed(true)}
          mapPadding={{
            top: mapTopPad,
            bottom: MAP_FLOATING_BOTTOM_CHROME,
            left: 8,
            right: 8,
          }}
          rotateEnabled={false}
          scrollEnabled
          zoomEnabled
          pitchEnabled={false}
          {...(Platform.OS === 'android' ? { googleRenderer: 'LEGACY', loadingEnabled: true } : {})}
          showsTraffic={false}
          showsPointsOfInterest
          showsBuildings
          showsUserLocation
          onUserLocationChange={(e) => {
            const c = e?.nativeEvent?.coordinate;
            if (
              c &&
              typeof c.latitude === 'number' &&
              typeof c.longitude === 'number' &&
              !Number.isNaN(c.latitude) &&
              !Number.isNaN(c.longitude)
            ) {
              setNearbyMapHub({ latitude: c.latitude, longitude: c.longitude });
            }
          }}
        >
          {showBiddingHubRiderMarker ? (
            <RiderMapMarker
              coordinate={nearbyMapHub}
              title="You"
              description="Your position"
            />
          ) : null}
          {biddingPolylineCoords.length >= 2 ? (
            <>
              <Polyline
                coordinates={biddingPolylineCoords}
                strokeColor="rgba(255,255,255,0.95)"
                strokeWidth={Platform.OS === 'android' ? 15 : 12}
                lineCap="round"
                lineJoin="round"
                geodesic={false}
                zIndex={4}
              />
              <Polyline
                coordinates={biddingPolylineCoords}
                strokeColor={theme.colors.accent}
                strokeWidth={Platform.OS === 'android' ? 10 : 7}
                lineCap="round"
                lineJoin="round"
                geodesic={false}
                zIndex={5}
              />
            </>
          ) : null}
          {biddingPickupLL ? (
            <Circle
              center={biddingPickupLL}
              radius={PICKUP_DRIVER_SEARCH_RADIUS_M}
              strokeColor={isDark ? 'rgba(167, 139, 250, 0.65)' : 'rgba(124, 58, 237, 0.6)'}
              fillColor={isDark ? 'rgba(124, 58, 237, 0.12)' : 'rgba(124, 58, 237, 0.07)'}
              strokeWidth={2}
              zIndex={1}
            />
          ) : null}
          {biddingPickupLL && biddingDropLL ? (
            <>
              <RiderMapMarker
                markerKeyPrefix="pickup"
                zIndex={14}
                coordinate={biddingPickupLL}
                title="Pickup"
                description={(biddingMapLocationLines.pickup || sheetPickupText).slice(0, 120)}
              />
              <DropoffMapMarker
                coordinate={biddingDropLL}
                title="Dropoff"
                description={(biddingMapLocationLines.dropoff || sheetDropoffText).slice(0, 120)}
              />
              {biddingVendorMapCoord && biddingFoodStopMerged ? (
                <FoodStopMapMarker
                  coordinate={biddingVendorMapCoord}
                  title={biddingFoodStopMerged.vendorName || 'Vendor'}
                  description={(biddingMapLocationLines.food || foodStopSheetSubline || 'Food pickup').slice(0, 120)}
                  menuIconId={biddingFoodStopMerged.mapIconId}
                  accentColor={theme.colors.orange}
                />
              ) : null}
              {biddingRoutePoints.length > 2
                ? biddingRoutePoints.slice(1, -1).map((coord, idx) => {
                    if (
                      biddingVendorMapCoord &&
                      haversineKm(
                        coord.latitude,
                        coord.longitude,
                        biddingVendorMapCoord.latitude,
                        biddingVendorMapCoord.longitude,
                      ) < 0.05
                    ) {
                      return null;
                    }
                    const label = biddingMiddleLabels[idx] || `Stop ${idx + 1}`;
                    return (
                      <WaypointDotMapMarker
                        key={`bidding-stop-${idx}-${coord.latitude.toFixed(4)}`}
                        coordinate={coord}
                        title={label}
                        description={String(label).slice(0, 80)}
                        color={theme.colors.accent}
                        zIndex={24}
                      />
                    );
                  })
                : null}
            </>
          ) : null}
          <NearbyDriversMapOverlay
            center={biddingDriverSearchCenter}
            visible={Platform.OS !== 'web'}
            isSearching
          />
        </MapView>
        <DriverSearchRadar
          visible={!!biddingPickupLL}
          variant="bidding"
          accentColor={theme.colors.primary}
          hubColor={isDark ? theme.colors.card : theme.colors.surface}
        />
        <View style={styles.mapChromeOverlay} pointerEvents="box-none">
          <View style={[styles.floatingTopBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <View style={styles.floatingTopBarInner} pointerEvents="auto">
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.scanningPill} pointerEvents="box-none">
            <View style={styles.scanningPillRow} pointerEvents="auto">
              <View style={styles.scanningPillTextCol}>
                <Text style={styles.scanningTitle}>
                  {showEmptyState
                    ? t('riderBidding.scanningPillEmptyTitle')
                    : t('riderBidding.scanningPillLiveTitle')}
                </Text>
                <Text style={styles.scanningSub} numberOfLines={2}>
                  {showEmptyState
                    ? t('riderBidding.scanningPillEmptySub')
                    : t('riderBidding.scanningPillLiveSub')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCancelModal(true)}
                style={styles.cancelRideBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Cancel ride"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons name="close" size={20} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      <View style={[styles.bottomSheet, { maxHeight: bottomSheetMaxH }]}>
        <View style={styles.sheetHandleWrap} accessibilityRole="adjustable" accessibilityLabel="Ride details panel">
          <View style={[styles.sheetHandle, { backgroundColor: theme.colors.textSecondary + '55' }]} />
        </View>
        <ScrollView
          style={[styles.scroll, { maxHeight: sheetScrollMaxH }]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 18 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          nestedScrollEnabled
          bounces
        >
          {showNearbyDriversTitleBanner ? (
            <View style={styles.nearbyDriversBanner}>
              <Text style={styles.titleInBanner}>{t('riderBidding.counterBanner')}</Text>
              <TouchableOpacity
                style={styles.nearbyDriversOkBtn}
                onPress={() => setShowNearbyDriversTitleBanner(false)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('riderBidding.dismissNearbyBannerA11y')}
              >
                <Text style={styles.nearbyDriversOkText}>{t('riderBidding.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <Animated.View
            style={[
              styles.bidSummaryCard,
              {
                opacity: bidSummaryAnim,
                transform: [
                  {
                    translateY: bidSummaryAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.bidSummaryLabel}>{t('riderBidding.yourOffer')}</Text>
            <Text style={styles.bidSummaryAmount} accessibilityRole="text">
              {formatJmdPrimary(riderFareBr.total)}
            </Text>
            <Text style={styles.fareBreakdownHeading}>{t('riderBidding.fareBreakdown')}</Text>
            <View style={styles.fareBreakdownBox}>
              {riderFareBr.hasFoodItems ? (
                <>
                  <View style={styles.fareBreakdownRow}>
                    <Text style={styles.fareBreakdownLabel}>{t('riderBidding.fbDriver')}</Text>
                    <Text style={styles.fareBreakdownValue}>{formatJmdPrimary(riderFareBr.payDriver)}</Text>
                  </View>
                  <View style={styles.fareBreakdownDivider} />
                  <View style={styles.fareBreakdownRow}>
                    <Text style={styles.fareBreakdownLabel}>{t('riderBidding.fbFoodMenu')}</Text>
                    <Text style={styles.fareBreakdownValue}>{formatJmdPrimary(riderFareBr.payVendorFood)}</Text>
                  </View>
                  <View style={[styles.fareBreakdownRow, styles.fareBreakdownTotalRow]}>
                    <Text style={styles.fareBreakdownLabel}>{t('riderBidding.fbTotalYouPay')}</Text>
                    <Text style={styles.fareBreakdownValue}>{formatJmdPrimary(riderFareBr.total)}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.fareBreakdownRow}>
                    <Text style={styles.fareBreakdownLabel}>{t('riderBidding.fbTripFees')}</Text>
                    <Text style={styles.fareBreakdownValue}>{formatJmdPrimary(riderFareBr.payDriver)}</Text>
                  </View>
                  {riderFareBr.hasFoodStop ? (
                    <Text style={styles.fareBreakdownHint}>{t('riderBidding.fbMenuVendorPaidHint')}</Text>
                  ) : (
                    <Text style={styles.fareBreakdownHint}>{t('riderBidding.fbListedNegotiateHint')}</Text>
                  )}
                  <View style={[styles.fareBreakdownRow, styles.fareBreakdownTotalRow]}>
                    <Text style={styles.fareBreakdownLabel}>{t('riderBidding.fbTotalYouPay')}</Text>
                    <Text style={styles.fareBreakdownValue}>{formatJmdPrimary(riderFareBr.total)}</Text>
                  </View>
                </>
              )}
            </View>
            {useRedeem ? (
              <View style={styles.bidSummaryMetaRow}>
                <Ionicons name="wallet-outline" size={17} color={theme.colors.secondary} />
                <Text style={styles.bidSummaryMetaText}>
                  {t('riderBidding.coinsApplied', {
                    coins: REDEEM_RATE,
                    amount: formatJmdPrimary(REDEEM_DISCOUNT),
                  })}
                </Text>
              </View>
            ) : null}
            <View style={styles.routeBlock}>
              <View style={styles.routeLine}>
                <View style={[styles.routeDot, { backgroundColor: theme.colors.primary }]} />
                <View style={styles.routeLineTextCol}>
                  <Text style={styles.routeLineKicker}>{t('riderBidding.pickup')}</Text>
                  <Text style={styles.routeLineText} numberOfLines={3}>
                    {sheetPickupText}
                  </Text>
                </View>
              </View>
              {biddingFoodStopMerged?.vendorName ? (
                <View style={styles.routeLine}>
                  <View style={[styles.routeDot, styles.routeDotFood]} />
                  <View style={styles.routeLineTextCol}>
                    <Text style={styles.routeLineKicker}>{t('riderBidding.foodStop')}</Text>
                    <Text style={styles.routeLineText} numberOfLines={2}>
                      {String(biddingFoodStopMerged.vendorName).trim()}
                    </Text>
                    {foodStopSheetSubline ? (
                      <Text style={styles.routeLineSub} numberOfLines={4}>
                        {foodStopSheetSubline}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {biddingStopsList.map((label, i) => (
                <View style={styles.routeLine} key={`bidding-sheet-stop-${i}-${label.slice(0, 24)}`}>
                  <View style={[styles.routeDot, styles.routeDotMid]} />
                  <View style={styles.routeLineTextCol}>
                    <Text style={styles.routeLineKicker}>{t('riderBidding.extraStop', { n: i + 1 })}</Text>
                    <Text style={styles.routeLineText} numberOfLines={4}>
                      {label}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={styles.routeLine}>
                <View style={[styles.routeDot, styles.routeDotDrop]} />
                <View style={styles.routeLineTextCol}>
                  <Text style={styles.routeLineKicker}>{t('riderBidding.destination')}</Text>
                  <Text style={styles.routeLineText} numberOfLines={3}>
                    {sheetDropoffText}
                  </Text>
                </View>
              </View>
            </View>
            {biddingTripDistanceLabel ? (
              <View style={styles.routeChip}>
                <Ionicons name="map-outline" size={20} color={theme.colors.accent} />
                <Text style={styles.routeChipText}>
                  {t('riderBidding.tripChip', { label: biddingTripDistanceLabel })}
                </Text>
              </View>
            ) : null}
          </Animated.View>
          {visibleDrivers.length > 0 && (
            <View style={styles.etaBanner}>
              <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.etaText}>{t('riderBidding.etaHint')}</Text>
            </View>
          )}
          {showEmptyState ? (
            <Text style={styles.emptySheetHint}>{t('riderBidding.mapNearbyFooter')}</Text>
          ) : null}
          {visibleDrivers.map((item) =>
            renderDriverCard(item, {
              hideBiddingRow: leadDriver != null && item.id === leadDriver.id,
            }),
          )}
        </ScrollView>
      </View>
      <CancelRideModal
        visible={showCancelModal}
        onCancel={() => setShowCancelModal(false)}
        onConfirm={handleCancelRide}
        isDriver={false}
      />
    </View>
  );
}

const createStyles = (theme, isDark = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  biddingTopBanner: { position: 'absolute', zIndex: 50 },
  driverAcceptedTopCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...riderCardElevation(isDark),
  },
  driverAcceptedOfferBlock: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  driverAcceptedTheirLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginBottom: 4,
  },
  driverAcceptedTopOfferHero: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  driverAcceptedFareSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 16,
  },
  driverAcceptedFareSubBold: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    lineHeight: 18,
  },
  driverAcceptedYourCounterBlock: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 2,
  },
  driverAcceptedYourCounterTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.65,
    marginBottom: 4,
  },
  driverAcceptedYourCounterAmount: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  driverAcceptedTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  driverAcceptedTopBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  driverAcceptedTopCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: theme.colors.background,
  },
  driverAcceptedTopCloseBtnText: { fontSize: 12, fontWeight: '700' },
  driverAcceptedTopBadgeText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  driverAcceptedTopMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  driverAcceptedTopAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primaryLight,
  },
  driverAcceptedTopAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  driverAcceptedTopTextCol: { flex: 1, minWidth: 0 },
  driverAcceptedTopName: { fontSize: 17, fontWeight: '800' },
  driverAcceptedTopMeta: { fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 16 },
  driverAcceptedTopMore: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  driverAcceptedTopBidding: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  driverAcceptedTopBiddingLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  driverAcceptedTopCounterInput: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  driverAcceptedTopBidActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  driverAcceptedTopDeclineBtn: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  driverAcceptedTopDeclineBtnText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.2 },
  driverAcceptedTopSendBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FACC15',
    borderWidth: 2,
    borderColor: '#CA8A04',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  driverAcceptedTopSendBtnDisabled: {
    opacity: 0.42,
    borderColor: '#A16207',
  },
  driverAcceptedTopSendBtnText: {
    color: '#0A0A0A',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.15,
  },
  driverAcceptedTopSendBtnTextDisabled: {
    color: '#57534E',
  },
  driverAcceptedTopAcceptBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...riderSuccessButtonLift(),
  },
  leadDriverListHint: { fontSize: 13, fontWeight: '600', marginTop: 8, lineHeight: 18 },
  mapShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    position: 'relative',
  },
  mapFill: { ...StyleSheet.absoluteFillObject },
  mapChromeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  floatingTopBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  floatingTopBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface + 'F2',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.primaryLight,
    ...riderFloatingBarShadow(),
  },
  backBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  scanningPill: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    zIndex: 4,
    backgroundColor: isDark ? theme.colors.surface + 'EE' : 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  scanningPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  scanningPillTextCol: {
    flex: 1,
    minWidth: 0,
  },
  scanningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primary,
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  scanningSub: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'left',
    lineHeight: 17,
  },
  bottomSheet: {
    flexShrink: 0,
    width: '100%',
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth * 1.5,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? theme.colors.primaryLight + '55' : theme.colors.primaryLight + '88',
    ...Platform.select({
      android: { elevation: 16 },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: isDark ? 0.45 : 0.12,
        shadowRadius: 24,
      },
      default: {},
    }),
  },
  sheetHandleWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 2 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 2 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.35, color: theme.colors.primary, marginBottom: 8 },
  bidSummaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight + (isDark ? '55' : '77'),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  bidSummaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bidSummaryAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  fareBreakdownHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 2,
  },
  fareBreakdownBox: {
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + (isDark ? '14' : '0C'),
    borderWidth: 1,
    borderColor: theme.colors.primaryLight + '99',
    gap: 8,
  },
  fareBreakdownDivider: {
    height: 1,
    backgroundColor: theme.colors.primaryLight + '66',
    marginVertical: 2,
  },
  fareBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  fareBreakdownLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, lineHeight: 18 },
  fareBreakdownValue: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  fareBreakdownTotalRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.primaryLight + '88',
  },
  fareBreakdownHint: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, lineHeight: 17 },
  fareBreakdownSingle: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  bidSummaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bidSummaryMetaText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  routeBlock: { marginTop: 2, marginBottom: 2, gap: 8 },
  routeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeDotDrop: { backgroundColor: '#7C3AED', borderWidth: 2, borderColor: '#A78BFA' },
  routeDotFood: {
    backgroundColor: theme.colors.orange,
    borderWidth: 2,
    borderColor: theme.colors.orangeDark,
  },
  routeDotMid: {
    backgroundColor: theme.colors.accent,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight + 'CC',
  },
  routeLineTextCol: { flex: 1, minWidth: 0 },
  routeLineKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  routeLineText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: theme.colors.text },
  routeLineSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  nearbyDriversBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primary + (isDark ? '18' : '10'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '44',
  },
  titleInBanner: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primary,
    lineHeight: 20,
  },
  nearbyDriversOkBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyDriversOkText: {
    color: theme.colors.onPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  cancelRideBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    flexShrink: 0,
    backgroundColor: isDark ? theme.colors.error + '24' : theme.colors.error + '12',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.error + (isDark ? '55' : '38'),
  },
  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.colors.accent + '55',
    backgroundColor: theme.colors.accent + (isDark ? '18' : '12'),
  },
  routeChipText: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  emptySheetHint: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary + (isDark ? '22' : '14'),
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary + '33',
  },
  etaText: { flex: 1, fontSize: 16, color: theme.colors.text, fontWeight: '700' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? theme.colors.primaryLight + '55' : theme.colors.primaryLight + '99',
    ...riderCardElevation(isDark),
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  cardTopText: { flex: 1 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.background },
  driverAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.primaryLight },
  vehicleMeta: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 21 },
  rankRegionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { fontSize: 11, color: theme.colors.success, backgroundColor: theme.colors.success + '30', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  driverName: { fontSize: 19, fontWeight: '800', color: theme.colors.text },
  rating: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },
  priceRow: { marginBottom: 12 },
  price: { fontSize: 28, fontWeight: '800', color: theme.colors.accent, letterSpacing: -0.6 },
  counterLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.primary, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  rejectBtnOutline: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.error + 'AA',
    backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
  },
  rejectBtnOutlineText: { fontSize: 14, fontWeight: '800', color: theme.colors.error },
  counterInput: {
    flex: 1,
    minWidth: 120,
    backgroundColor: theme.colors.background,
    padding: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  counterBtn: { backgroundColor: theme.colors.primary, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  counterBtnDisabled: { opacity: 0.5 },
  counterBtnText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 15 },
  acceptBtn: {
    backgroundColor: theme.colors.success,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    ...riderSuccessButtonLift(),
  },
  acceptText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 16 },
});
