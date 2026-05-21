import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Platform,
  Pressable,
  useWindowDimensions,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import ThemedTextInput from '../../components/ThemedTextInput';
import FoodStopMapMarker from '../../components/FoodStopMapMarker';
import DropoffMapMarker from '../../components/DropoffMapMarker';
import RiderMapIcon from '../../components/RiderMapIcon';
import DropoffMapIcon from '../../components/DropoffMapIcon';
import NearbyDriversMapOverlay from '../../components/NearbyDriversMapOverlay';
import { MAP_MARKER_DROPOFF_W_DP, MAP_MARKER_RIDER_ICON_DP } from '../../constants/mapMarkerAndroid';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { resolveAuthUid } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import { useRemoteFlags } from '../../context/RemoteFlagsContext';
import { createRideRequest, subscribeToRiderOngoingRide } from '../../services/rideService';
import VoiceBiddingButton from '../../components/VoiceBiddingButton';
import { haversineKm } from '../../utils/haversine';
import { getDistanceBasedFare, getVendorsNearRoute, MIN_FARE_JMD } from '../../utils/fareUtils';
import {
  computeFoodStopServiceFee,
  FOOD_STOP_SERVICE_BASE_JMD,
  FOOD_STOP_WAIT_PER_BLOCK_JMD,
  FOOD_STOP_WAIT_BLOCK_MINUTES,
} from '../../utils/foodStopFee';
import { computeSmartSuggestedFare } from '../../services/smartFareEstimateService';
import AddressSuggestInput from '../../components/AddressSuggestInput';
import DemandHeatmapLayer, { DemandHeatmapLegend } from '../../components/DemandHeatmapLayer';
import { REDEEM_DISCOUNT, REDEEM_RATE, canApplyCoinRedemption } from '../../services/iriCoinsService';
import { DEFAULT_RIDER_COINS_FALLBACK } from '../../constants/armadaCoins';
import { primaryMapIconFromMenuRows } from '../../constants/vendorMenuIcons';
import { DEFAULT_JAMAICA_MAP_REGION, RIDER_HOME_INITIAL_MAP_REGION } from '../../constants/mapRegionDefaults';
import {
  mapRegionCloseOnPickup,
  mapRegionDeltasForSearchRadiusKm,
  RIDER_MAP_PRE_SCAN_ZOOM_MULTIPLIER,
  RIDE_REQUEST_SEARCH_ZOOM_IN_MS,
  RIDE_REQUEST_SEARCH_ZOOM_OUT_MS,
} from '../../utils/mapPickupSearchRegion';
import { validatePromo, getPromoDiscount } from '../../services/promoService';
import { subscribeToVendors, parseVendorMapLatLng } from '../../services/vendorService';
import VendorMenuItemIcon from '../../components/VendorMenuItemIcon';
import { getRouteHistory, addRoute } from '../../services/routeHistoryService';
import { getSavedPlaces, saveSavedPlaces } from '../../services/savedPlacesService';
import { getRiderPreferences } from '../../services/riderPreferencesService';
import ConnectivityBanner from '../../components/ConnectivityBanner';
import { withSectionGuide } from '../../components/withSectionGuide';
import RentalCounterOfferModal from '../../components/RentalCounterOfferModal';
import { isFirebaseReady } from '../../config/firebase';
import * as Location from 'expo-location';
import {
  formatAddressFromExpoPlacemark,
  reverseGeocodeFormattedAddressAsync,
} from '../../services/reverseGeocodeService';
import { subscribeCarRentalRequestsForRider } from '../../services/carRentalService';
import { useMapDriverAnimationPause } from '../../hooks/useMapDriverAnimationPause';
import { useFocusEffect } from '@react-navigation/native';
import {
  riderCardElevation,
  riderBottomSheetShadow,
  riderPrimaryButtonLift,
} from '../../utils/riderUi';

const FALLBACK_VENDORS = [
  {
    id: 'jerkman',
    name: 'Jerkman',
    lat: 18.007,
    lng: -76.782,
    menu: [
      { id: 'j1', name: 'Jerk Chicken', price: 450 },
      { id: 'j2', name: 'Festival', price: 100 },
      { id: 'j3', name: 'Rice & Peas', price: 200 },
    ],
    items: ['Jerk Chicken', 'Festival', 'Rice & Peas'],
    pinColor: 'orange',
  },
  {
    id: 'patty-palace',
    name: 'Patty Palace',
    lat: 18.012,
    lng: -76.79,
    menu: [
      { id: 'p1', name: 'Beef Patty', price: 250 },
      { id: 'p2', name: 'Chicken Patty', price: 220 },
    ],
    items: ['Beef Patty', 'Chicken Patty'],
    pinColor: 'purple',
  },
  {
    id: 'kfc-kingston',
    name: 'KFC Kingston',
    lat: 18.005,
    lng: -76.795,
    menu: [
      { id: 'k1', name: 'Zinger Burger', price: 650 },
      { id: 'k2', name: 'Fries', price: 180 },
    ],
    items: ['Zinger Burger', 'Fries'],
    pinColor: 'red',
  },
];

/** Initial destination pin: near Kingston hub (not Montego Bay) until the rider moves it or types an address. */
const DEFAULT_DROPOFF_PIN = {
  latitude: DEFAULT_JAMAICA_MAP_REGION.latitude + 0.02,
  longitude: DEFAULT_JAMAICA_MAP_REGION.longitude + 0.022,
};
const STOP_FEE = 50;      // J$ per stop
const STOP_MINUTES = 5;   // minutes added per stop

/** Bright accents for pickup (green) vs destination (red) — labels and map step UI */
const RIDER_PICKUP_GREEN = '#00E676';
const RIDER_PICKUP_GREEN_SOLID = '#00C853';
const RIDER_DESTINATION_RED = '#FF1744';

/** ~Tab bar stack header (do not use useHeaderHeight here: native stack uses headerShown:false and the hook throws). */
const EST_TOP_TAB_HEADER = Platform.OS === 'ios' ? 52 : 56;
const EST_BOTTOM_TAB_BAR = Platform.OS === 'ios' ? 49 : 58;
/** Collapsed “peek” height (taller so arrow + chip + copy aren’t clipped). */
const COLLAPSED_SHEET_HEIGHT = 102;
/** Height of the “minimize” strip above the scroll area when the rider sheet is expanded */
const RIDER_SHEET_COLLAPSE_STRIP_HEIGHT = 56;

/**
 * Minimize bottom sheet → zoom map in; expand → zoom out slightly.
 * Baseline ~1.8% per toggle; 100× raw adjust would make (1 - adjust) negative,
 * so zoom-in mult is floored; zoom-out uses raw adjust (then clamped).
 */
const RIDER_SHEET_MAP_DELTA_ADJUST = 0.018 * 100;
const RIDER_SHEET_ZOOM_IN_MULT = Math.max(0.025, 1 - RIDER_SHEET_MAP_DELTA_ADJUST);
const RIDER_SHEET_ZOOM_OUT_MULT = 1 + RIDER_SHEET_MAP_DELTA_ADJUST;
const RIDER_SHEET_MAP_MIN_DELTA = 0.0011;
const RIDER_SHEET_MAP_MAX_DELTA = 0.14;

function clampRiderSheetMapDelta(d) {
  if (!Number.isFinite(d)) return RIDER_HOME_INITIAL_MAP_REGION.latitudeDelta;
  return Math.min(RIDER_SHEET_MAP_MAX_DELTA, Math.max(RIDER_SHEET_MAP_MIN_DELTA, d));
}

function RiderHomeScreen({ navigation, route }) {
  const { theme, isDark } = useTheme();
  const { flags } = useRemoteFlags();
  const { t, formatJmd, formatJmdPrimary } = useLocale();
  const { pauseAnimations, onMapPanDrag, onMapIdle } = useMapDriverAnimationPause();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { userProfile, user } = useAuth();
  const rebook = route?.params ?? {};
  const [pickup, setPickup] = useState(rebook.rebookPickup || 'Kingston, Jamaica');
  const [stops, setStops] = useState([]);
  const [draftStop, setDraftStop] = useState(null);
  const [dropoff, setDropoff] = useState(rebook.rebookDropoff || '');
  const [bidPrice, setBidPrice] = useState('1500');
  /** After the rider edits the bid (or voice/defaults), smart/straight-line suggestions no longer overwrite it until they tap “Use suggested fare”. */
  const bidManuallyEditedRef = useRef(false);
  const [bidManuallyTouched, setBidManuallyTouched] = useState(false);
  const [fareSuggestion, setFareSuggestion] = useState({ status: 'idle' });
  const [loading, setLoading] = useState(false);
  const [splitCount, setSplitCount] = useState(1);
  const [foodStopModalVisible, setFoodStopModalVisible] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [foodStop, setFoodStop] = useState(null);
  const [foodStopNotes, setFoodStopNotes] = useState('');
  const [useRedeem, setUseRedeem] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [vendors, setVendors] = useState(FALLBACK_VENDORS);
  const [routeHistory, setRouteHistory] = useState([]);
  const [recentRoutesExpanded, setRecentRoutesExpanded] = useState(false);
  const [fareDetailsExpanded, setFareDetailsExpanded] = useState(false);
  const [savingsSectionExpanded, setSavingsSectionExpanded] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [riderHomeMapRemountKey, setRiderHomeMapRemountKey] = useState(0);
  const [popupVendor, setPopupVendor] = useState(null);
  /** When this equals {@link ridePlanningGeneration}, the route food-stop nudge stays hidden until the next planning session. */
  const [foodStopPopupDismissedGeneration, setFoodStopPopupDismissedGeneration] = useState(null);
  /** Bumps when the rider finishes a request or restarts planning so “Not now” only applies to the current draft. */
  const [ridePlanningGeneration, setRidePlanningGeneration] = useState(0);
  const [rentalCounterReq, setRentalCounterReq] = useState(null);
  const rentalUnavailableShown = useRef(new Set());
  const mapRef = useRef(null);
  /** Google Maps sometimes ignores the first `animateToRegion` if it runs before `onMapReady`. */
  const mapReadyRef = useRef(false);
  const programmaticMapMove = useRef(false);
  /** Stops `onRegionChangeStart` from collapsing the sheet right after `animateToRegion` (that was hiding the pin). */
  const suppressSheetCollapseUntilRef = useRef(0);
  /** Last camera region — deltas for `animateToRegion` after map taps. */
  const mapRegionRef = useRef(null);
  /** Track sheet toggles for map zoom-in/out with the bottom panel. */
  const prevSheetExpandedForMapZoomRef = useRef(false);
  const riderSheetMapZoomTimerRef = useRef(null);
  const heatmapRegionThrottleRef = useRef(0);
  /** True after the user drags the map (iOS often omits `isGesture`; Android is reliable). */
  const userMapPanActiveRef = useRef(false);
  const pickupGeocodeTimerRef = useRef(null);
  const dropoffGeocodeTimerRef = useRef(null);
  /** While true, pickup pin tracks `nearbyMapHub` (GPS). Set false when user drags the pin. */
  const pinFollowsDeviceLocationRef = useRef(true);
  const firstGpsMapCenterRef = useRef(false);
  /** Drop stale reverse-geocode results when a newer request started (avoids pickup text “jumping”). */
  const pickupGeocodeSeqRef = useRef(0);
  /** After “My location”, skip hub-driven geocode briefly so GPS watch + tap don’t stack 5 different addresses. */
  const suppressPickupGeocodeFromHubUntilRef = useRef(0);
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [ongoingRide, setOngoingRide] = useState(null);
  /** Hides the ongoing-ride strip (finding drivers / in progress) for this ride id until the ride changes. */
  const [dismissedBiddingBannerRideId, setDismissedBiddingBannerRideId] = useState(null);
  /** Hides the map pickup/dropoff floating card; reset when placement phase or planning session changes. */
  const [mapSetupCardDismissed, setMapSetupCardDismissed] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState({ home: '', work: '' });
  const [locationLoading, setLocationLoading] = useState(false);
  const [nearbyMapHub, setNearbyMapHub] = useState(() => ({
    latitude: DEFAULT_JAMAICA_MAP_REGION.latitude,
    longitude: DEFAULT_JAMAICA_MAP_REGION.longitude,
  }));
  const [showDemandHeatmap, setShowDemandHeatmap] = useState(false);
  /** Mirrors Settings → Activity overlay; hides map control when false. */
  const [activityMapControlEnabled, setActivityMapControlEnabled] = useState(true);
  const heatmapFeatureOn = activityMapControlEnabled && flags.heatmapEnabled;
  useEffect(() => {
    if (!flags.heatmapEnabled) setShowDemandHeatmap(false);
  }, [flags.heatmapEnabled]);
  const [heatmapRegion, setHeatmapRegion] = useState(() => ({
    latitude: RIDER_HOME_INITIAL_MAP_REGION.latitude,
    longitude: RIDER_HOME_INITIAL_MAP_REGION.longitude,
    latitudeDelta: RIDER_HOME_INITIAL_MAP_REGION.latitudeDelta,
    longitudeDelta: RIDER_HOME_INITIAL_MAP_REGION.longitudeDelta,
  }));
  const [riderPickPin, setRiderPickPin] = useState(() => ({
    latitude: DEFAULT_JAMAICA_MAP_REGION.latitude,
    longitude: DEFAULT_JAMAICA_MAP_REGION.longitude,
  }));
  const [riderPickPinLabel, setRiderPickPinLabel] = useState('');
  const [riderPickPinGeocoding, setRiderPickPinGeocoding] = useState(false);
  /** Map crosshair sets pickup first, then destination after user confirms pickup. */
  const [mapPlacementPhase, setMapPlacementPhase] = useState(() => 'pickup');
  const [riderDropPin, setRiderDropPin] = useState(() => ({
    latitude: DEFAULT_DROPOFF_PIN.latitude,
    longitude: DEFAULT_DROPOFF_PIN.longitude,
  }));
  const [riderDropPinGeocoding, setRiderDropPinGeocoding] = useState(false);
  /** After confirming route, sonar + driver radius use pickup (not live GPS). Cleared when editing pickup or starting a ride. */
  const [driverScanAtPickup, setDriverScanAtPickup] = useState(false);
  const sheetWasExpandedRef = useRef(false);

  const driverOverlayCenter = useMemo(
    () =>
      driverScanAtPickup
        ? { latitude: riderPickPin.latitude, longitude: riderPickPin.longitude }
        : nearbyMapHub,
    [
      driverScanAtPickup,
      riderPickPin.latitude,
      riderPickPin.longitude,
      nearbyMapHub.latitude,
      nearbyMapHub.longitude,
    ],
  );

  const vendorPinsForHeat = useMemo(() => {
    return vendors
      .map((v) => {
        const ll = parseVendorMapLatLng(v);
        return ll ? { latitude: ll.lat, longitude: ll.lng } : null;
      })
      .filter(Boolean);
  }, [vendors]);

  /** Idle map: hide driver pins unless submitting, pickup scan, or ride is bidding. */
  const showNearbyDriverMarkers = useMemo(
    () => driverScanAtPickup || loading || ongoingRide?.status === 'bidding',
    [driverScanAtPickup, loading, ongoingRide?.status],
  );

  /** Food vendors with valid pins stay visible on the map for every booking phase (pickup + dropoff). */
  const showFoodVendorMarkers = true;

  const refreshActivityMapControlPref = useCallback(async () => {
    try {
      const uid = userProfile?.id || resolveAuthUid(user, userProfile);
      const p = await getRiderPreferences(uid);
      const on = p.showActivityMapControl !== false;
      setActivityMapControlEnabled(on);
      if (!on) setShowDemandHeatmap(false);
    } catch {
      setActivityMapControlEnabled(true);
    }
  }, [user, userProfile?.id]);

  useFocusEffect(
    useCallback(() => {
      void refreshActivityMapControlPref();
    }, [refreshActivityMapControlPref]),
  );

  const resolveAddressForRiderPin = useCallback(async (latitude, longitude) => {
    const seq = ++pickupGeocodeSeqRef.current;
    setRiderPickPinGeocoding(true);
    try {
      let line = await reverseGeocodeFormattedAddressAsync(latitude, longitude);
      if (seq !== pickupGeocodeSeqRef.current) return;
      if (!line) {
        const rows = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (seq !== pickupGeocodeSeqRef.current) return;
        const p = rows?.[0];
        line =
          formatAddressFromExpoPlacemark(p) || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }
      setRiderPickPinLabel(line);
      setPickup(line);
    } catch (_e) {
      if (seq !== pickupGeocodeSeqRef.current) return;
      const fallback = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      setRiderPickPinLabel(fallback);
      setPickup(fallback);
    } finally {
      if (seq === pickupGeocodeSeqRef.current) {
        setRiderPickPinGeocoding(false);
      }
    }
  }, []);

  const resolveAddressForDropPin = useCallback(async (latitude, longitude) => {
    setRiderDropPinGeocoding(true);
    try {
      let line = await reverseGeocodeFormattedAddressAsync(latitude, longitude);
      if (!line) {
        const rows = await Location.reverseGeocodeAsync({ latitude, longitude });
        const p = rows?.[0];
        line =
          formatAddressFromExpoPlacemark(p) || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }
      setDropoff(line);
    } catch (_e) {
      setDropoff(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } finally {
      setRiderDropPinGeocoding(false);
    }
  }, []);

  const animateMapToPin = useCallback((latitude, longitude) => {
    const guardMs = Platform.OS === 'android' ? 2800 : 2200;
    const run = () => {
      if (!mapRef.current) return;
      programmaticMapMove.current = true;
      suppressSheetCollapseUntilRef.current = Date.now() + guardMs;
      mapRef.current.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: RIDER_HOME_INITIAL_MAP_REGION.latitudeDelta,
          longitudeDelta: RIDER_HOME_INITIAL_MAP_REGION.longitudeDelta,
        },
        500,
      );
      setTimeout(() => {
        programmaticMapMove.current = false;
      }, guardMs);
    };
    requestAnimationFrame(() => setTimeout(run, Platform.OS === 'android' ? 280 : 120));
  }, []);

  const hubSyncKey = useMemo(
    () =>
      `${Math.round(nearbyMapHub.latitude * 1e4) / 1e4}_${Math.round(nearbyMapHub.longitude * 1e4) / 1e4}`,
    [nearbyMapHub.latitude, nearbyMapHub.longitude],
  );

  const schedulePickupGeocode = useCallback((latitude, longitude, delayMs) => {
    if (pickupGeocodeTimerRef.current) clearTimeout(pickupGeocodeTimerRef.current);
    pickupGeocodeTimerRef.current = setTimeout(() => {
      pickupGeocodeTimerRef.current = null;
      resolveAddressForRiderPin(latitude, longitude);
    }, delayMs);
  }, [resolveAddressForRiderPin]);

  const scheduleDropoffGeocode = useCallback((latitude, longitude, delayMs) => {
    if (dropoffGeocodeTimerRef.current) clearTimeout(dropoffGeocodeTimerRef.current);
    dropoffGeocodeTimerRef.current = setTimeout(() => {
      dropoffGeocodeTimerRef.current = null;
      resolveAddressForDropPin(latitude, longitude);
    }, delayMs);
  }, [resolveAddressForDropPin]);

  useEffect(
    () => () => {
      if (pickupGeocodeTimerRef.current) clearTimeout(pickupGeocodeTimerRef.current);
      if (dropoffGeocodeTimerRef.current) clearTimeout(dropoffGeocodeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (mapPlacementPhase !== 'pickup') return;
    if (!pinFollowsDeviceLocationRef.current) return;
    const { latitude, longitude } = nearbyMapHub;
    setRiderPickPin({ latitude, longitude });
    if (Date.now() >= suppressPickupGeocodeFromHubUntilRef.current) {
      schedulePickupGeocode(latitude, longitude, 1000);
    }
    if (!firstGpsMapCenterRef.current) {
      const kmFromDefault = haversineKm(
        DEFAULT_JAMAICA_MAP_REGION.latitude,
        DEFAULT_JAMAICA_MAP_REGION.longitude,
        latitude,
        longitude,
      );
      if (kmFromDefault > 0.25) {
        firstGpsMapCenterRef.current = true;
        animateMapToPin(latitude, longitude);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use hubSyncKey + nearbyMapHub from the same render when the key changes.
  }, [hubSyncKey, mapPlacementPhase, schedulePickupGeocode, animateMapToPin]);

  useEffect(() => {
    if (!sheetExpanded) {
      sheetWasExpandedRef.current = false;
      return;
    }
    const reopeningFromCollapsed = !sheetWasExpandedRef.current;
    sheetWasExpandedRef.current = true;
    if (reopeningFromCollapsed && mapPlacementPhase === 'pickup') {
      pinFollowsDeviceLocationRef.current = true;
      const { latitude, longitude } = nearbyMapHub;
      setRiderPickPin({ latitude, longitude });
      suppressPickupGeocodeFromHubUntilRef.current = Date.now() + 2000;
      schedulePickupGeocode(latitude, longitude, 450);
      animateMapToPin(latitude, longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on sheet expand/collapse, not on GPS
  }, [sheetExpanded, mapPlacementPhase, schedulePickupGeocode, animateMapToPin]);

  useEffect(() => {
    const prev = prevSheetExpandedForMapZoomRef.current;
    if (prev === null) {
      prevSheetExpandedForMapZoomRef.current = sheetExpanded;
      return undefined;
    }
    if (prev === sheetExpanded) return undefined;
    prevSheetExpandedForMapZoomRef.current = sheetExpanded;

    if (riderSheetMapZoomTimerRef.current) {
      clearTimeout(riderSheetMapZoomTimerRef.current);
      riderSheetMapZoomTimerRef.current = null;
    }

    const runZoom = () => {
      riderSheetMapZoomTimerRef.current = null;
      if (!mapRef.current || mapLoadFailed) return;
      const r = mapRegionRef.current;
      const lat = typeof r?.latitude === 'number' && Number.isFinite(r.latitude) ? r.latitude : riderPickPin.latitude;
      const lng = typeof r?.longitude === 'number' && Number.isFinite(r.longitude) ? r.longitude : riderPickPin.longitude;
      let latD =
        typeof r?.latitudeDelta === 'number' && Number.isFinite(r.latitudeDelta)
          ? r.latitudeDelta
          : RIDER_HOME_INITIAL_MAP_REGION.latitudeDelta;
      let lngD =
        typeof r?.longitudeDelta === 'number' && Number.isFinite(r.longitudeDelta)
          ? r.longitudeDelta
          : RIDER_HOME_INITIAL_MAP_REGION.longitudeDelta;
      const latRatio = latD > 0 ? lngD / latD : 1;
      const mult = sheetExpanded ? RIDER_SHEET_ZOOM_OUT_MULT : RIDER_SHEET_ZOOM_IN_MULT;
      latD = clampRiderSheetMapDelta(latD * mult);
      lngD = clampRiderSheetMapDelta(latD * latRatio);
      programmaticMapMove.current = true;
      suppressSheetCollapseUntilRef.current = Date.now() + 1800;
      mapRef.current.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: latD,
          longitudeDelta: lngD,
        },
        380,
      );
      setTimeout(() => {
        programmaticMapMove.current = false;
      }, 1600);
    };

    let delayMs = 0;
    if (sheetExpanded && mapPlacementPhase === 'pickup') {
      delayMs = Platform.OS === 'android' ? 540 : 480;
    }
    if (delayMs > 0) {
      riderSheetMapZoomTimerRef.current = setTimeout(runZoom, delayMs);
    } else {
      runZoom();
    }

    return () => {
      if (riderSheetMapZoomTimerRef.current) {
        clearTimeout(riderSheetMapZoomTimerRef.current);
        riderSheetMapZoomTimerRef.current = null;
      }
    };
  }, [sheetExpanded, mapPlacementPhase, riderPickPin.latitude, riderPickPin.longitude, mapLoadFailed]);

  const animateMapToLatLng = useCallback((latitude, longitude) => {
    const r = mapRegionRef.current;
    const latD =
      typeof r?.latitudeDelta === 'number' ? r.latitudeDelta : RIDER_HOME_INITIAL_MAP_REGION.latitudeDelta;
    const lngD =
      typeof r?.longitudeDelta === 'number' ? r.longitudeDelta : RIDER_HOME_INITIAL_MAP_REGION.longitudeDelta;
    const run = () => {
      if (!mapRef.current) return;
      programmaticMapMove.current = true;
      suppressSheetCollapseUntilRef.current = Date.now() + 2000;
      mapRef.current.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: latD,
          longitudeDelta: lngD,
        },
        280,
      );
      setTimeout(() => {
        programmaticMapMove.current = false;
      }, 2200);
    };
    requestAnimationFrame(() => setTimeout(run, Platform.OS === 'android' ? 60 : 40));
  }, []);

  const onMapPressPlacement = useCallback(
    (e) => {
      if (mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview') return;
      const c = e?.nativeEvent?.coordinate;
      if (
        !c ||
        typeof c.latitude !== 'number' ||
        typeof c.longitude !== 'number' ||
        Number.isNaN(c.latitude) ||
        Number.isNaN(c.longitude)
      ) {
        return;
      }
      pinFollowsDeviceLocationRef.current = false;
      if (mapPlacementPhase === 'pickup') {
        setRiderPickPin({ latitude: c.latitude, longitude: c.longitude });
        if (pickupGeocodeTimerRef.current) clearTimeout(pickupGeocodeTimerRef.current);
        resolveAddressForRiderPin(c.latitude, c.longitude);
      } else if (mapPlacementPhase === 'dropoff') {
        setRiderDropPin({ latitude: c.latitude, longitude: c.longitude });
        if (dropoffGeocodeTimerRef.current) clearTimeout(dropoffGeocodeTimerRef.current);
        resolveAddressForDropPin(c.latitude, c.longitude);
      }
      if (mapPlacementPhase === 'pickup' || mapPlacementPhase === 'dropoff') {
        animateMapToLatLng(c.latitude, c.longitude);
      }
    },
    [mapPlacementPhase, resolveAddressForRiderPin, resolveAddressForDropPin, animateMapToLatLng],
  );

  const onMapRegionChangeComplete = useCallback(
    (region, details) => {
      onMapIdle();
      mapRegionRef.current = region;
      if (
        heatmapFeatureOn &&
        showDemandHeatmap &&
        region?.latitude != null &&
        region.latitudeDelta != null &&
        region.longitudeDelta != null
      ) {
        const now = Date.now();
        if (now - heatmapRegionThrottleRef.current >= 380) {
          heatmapRegionThrottleRef.current = now;
          setHeatmapRegion({
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          });
        }
      }
      if (programmaticMapMove.current) {
        userMapPanActiveRef.current = false;
        return;
      }
      if (mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview') {
        userMapPanActiveRef.current = false;
        return;
      }
      const gesture = userMapPanActiveRef.current || details?.isGesture === true;
      userMapPanActiveRef.current = false;
      if (!gesture || !region) return;
      pinFollowsDeviceLocationRef.current = false;
      const { latitude, longitude } = region;
      if (mapPlacementPhase === 'pickup') {
        setRiderPickPin({ latitude, longitude });
        schedulePickupGeocode(latitude, longitude, 420);
      } else if (mapPlacementPhase === 'dropoff') {
        setRiderDropPin({ latitude, longitude });
        scheduleDropoffGeocode(latitude, longitude, 420);
      }
    },
    [
      mapPlacementPhase,
      onMapIdle,
      schedulePickupGeocode,
      scheduleDropoffGeocode,
      showDemandHeatmap,
      heatmapFeatureOn,
    ],
  );

  const confirmPickupOnMap = useCallback(() => {
    setMapPlacementPhase('dropoff');
    pinFollowsDeviceLocationRef.current = false;
    resolveAddressForDropPin(riderDropPin.latitude, riderDropPin.longitude);
    requestAnimationFrame(() => {
      animateMapToPin(riderDropPin.latitude, riderDropPin.longitude);
    });
  }, [riderDropPin.latitude, riderDropPin.longitude, resolveAddressForDropPin, animateMapToPin]);

  const confirmDropoffOnMap = useCallback(() => {
    setMapPlacementPhase('fareReview');
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!(s?.isConnected ?? true)));
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    const subRef = { current: null };
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !alive) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!alive) return;
        setNearbyMapHub({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 12,
            timeInterval: 2500,
          },
          ({ coords }) => {
            if (alive) {
              setNearbyMapHub({ latitude: coords.latitude, longitude: coords.longitude });
            }
          },
        );
        if (!alive) {
          sub.remove();
          return;
        }
        subRef.current = sub;
      } catch (_) {
        /* keep default hub */
      }
    })();
    return () => {
      alive = false;
      subRef.current?.remove?.();
      subRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (userProfile?.id) {
      getRouteHistory(userProfile.id).then((rows) => {
        if (Array.isArray(rows)) setRouteHistory(rows);
      });
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (!userProfile?.id) return;
    getSavedPlaces(userProfile.id).then(setSavedPlaces);
  }, [userProfile?.id]);

  useEffect(() => {
    const riderUid = resolveAuthUid(user, userProfile);
    if (!isFirebaseReady || !riderUid) {
      setOngoingRide(null);
      return () => {};
    }
    return subscribeToRiderOngoingRide(riderUid, setOngoingRide);
  }, [user, userProfile?.id]);

  const prevOngoingRideIdRef = useRef(null);
  useEffect(() => {
    const id = ongoingRide?.id ?? null;
    const prev = prevOngoingRideIdRef.current;
    prevOngoingRideIdRef.current = id;
    if (prev != null && id == null) {
      setMapPlacementPhase('pickup');
      setDriverScanAtPickup(false);
      setRidePlanningGeneration((g) => g + 1);
      bidManuallyEditedRef.current = false;
      setBidManuallyTouched(false);
      setPickup('Kingston, Jamaica');
      setDropoff('');
      setStops([]);
      setDraftStop(null);
      setFoodStop(null);
      setPopupVendor(null);
      setPromoCode('');
      setPromoError('');
      setUseRedeem(false);
      const lat = nearbyMapHub.latitude;
      const lng = nearbyMapHub.longitude;
      setRiderPickPin({ latitude: lat, longitude: lng });
      setRiderDropPin({
        latitude: DEFAULT_DROPOFF_PIN.latitude,
        longitude: DEFAULT_DROPOFF_PIN.longitude,
      });
      void resolveAddressForRiderPin(lat, lng);
      void resolveAddressForDropPin(DEFAULT_DROPOFF_PIN.latitude, DEFAULT_DROPOFF_PIN.longitude);
    }
  }, [
    ongoingRide,
    nearbyMapHub.latitude,
    nearbyMapHub.longitude,
    resolveAddressForRiderPin,
    resolveAddressForDropPin,
  ]);

  useEffect(() => {
    if (!ongoingRide?.id) return;
    setMapPlacementPhase((p) => (p === 'fareReview' || p === 'done' ? 'pickup' : p));
  }, [ongoingRide?.id]);

  useEffect(() => {
    setDismissedBiddingBannerRideId(null);
  }, [ongoingRide?.id]);

  useEffect(() => {
    setMapSetupCardDismissed(false);
  }, [mapPlacementPhase, ridePlanningGeneration]);

  useEffect(() => {
    if (rebook.rebookPickup) setPickup(rebook.rebookPickup);
    if (rebook.rebookDropoff) setDropoff(rebook.rebookDropoff);
    if (rebook.rebookPickup && rebook.rebookDropoff) {
      setMapPlacementPhase('done');
      bidManuallyEditedRef.current = false;
      setBidManuallyTouched(false);
    }
  }, [rebook.rebookPickup, rebook.rebookDropoff]);

  const prevDropoffForFoodPopupRef = useRef(dropoff);
  useEffect(() => {
    const prev = prevDropoffForFoodPopupRef.current;
    if (prev && String(prev).trim() && !String(dropoff || '').trim()) {
      setRidePlanningGeneration((g) => g + 1);
    }
    prevDropoffForFoodPopupRef.current = dropoff;
  }, [dropoff]);

  useEffect(() => {
    const suggested = getDistanceBasedFare(pickup, dropoff);
    if (!bidManuallyEditedRef.current) setBidPrice(String(suggested));
  }, [pickup, dropoff]);

  useEffect(() => {
    let cancelled = false;
    setFareSuggestion({ status: 'loading' });
    const t = setTimeout(async () => {
      const r = await computeSmartSuggestedFare(riderPickPin, riderDropPin, pickup, dropoff);
      if (cancelled) return;
      setFareSuggestion({ status: 'ok', ...r });
      if (!bidManuallyEditedRef.current && r.amount != null) {
        setBidPrice(String(r.amount));
      }
    }, 480);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    riderPickPin.latitude,
    riderPickPin.longitude,
    riderDropPin.latitude,
    riderDropPin.longitude,
  ]);

  useEffect(() => {
    const unsub = subscribeToVendors((v) => {
      setVendors(Array.isArray(v) && v.length > 0 ? v : FALLBACK_VENDORS);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isFirebaseReady || userProfile?.role !== 'rider' || !userProfile?.id) {
      setRentalCounterReq(null);
      return undefined;
    }
    return subscribeCarRentalRequestsForRider(userProfile.id, (rows) => {
      const counter = rows.find((r) => r.counterOffer?.status === 'pending');
      setRentalCounterReq(counter || null);
      rows.forEach((r) => {
        if (
          r.status === 'unavailable' &&
          r.riderVisibleMessage &&
          !rentalUnavailableShown.current.has(r.id)
        ) {
          rentalUnavailableShown.current.add(r.id);
          Alert.alert(t('riderHome.alertsCarRentalTitle'), r.riderVisibleMessage);
        }
      });
    });
  }, [userProfile?.id, userProfile?.role]);

  useEffect(() => {
    if (mapPlacementPhase !== 'done' && mapPlacementPhase !== 'fareReview') return;
    if (ongoingRide) return;
    if (loading) return;
    if (foodStopModalVisible) return;
    if (
      foodStopPopupDismissedGeneration != null &&
      foodStopPopupDismissedGeneration === ridePlanningGeneration
    ) {
      return;
    }
    if (foodStop || !pickup?.trim() || !dropoff?.trim()) return;
    const near = getVendorsNearRoute(vendors, pickup, dropoff);
    if (near.length === 0) return;
    const timer = setTimeout(() => {
      const random = near[Math.floor(Math.random() * near.length)];
      setPopupVendor(random);
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    pickup,
    dropoff,
    vendors,
    foodStop,
    foodStopPopupDismissedGeneration,
    ridePlanningGeneration,
    mapPlacementPhase,
    ongoingRide,
    loading,
    foodStopModalVisible,
  ]);

  useEffect(() => {
    if (mapPlacementPhase !== 'done' && mapPlacementPhase !== 'fareReview') setPopupVendor(null);
  }, [mapPlacementPhase]);

  const dismissFoodStopRoutePopupForThisDraft = useCallback(() => {
    setFoodStopPopupDismissedGeneration(ridePlanningGeneration);
  }, [ridePlanningGeneration]);

  const handlePopupAddStop = (vendor) => {
    setPopupVendor(null);
    dismissFoodStopRoutePopupForThisDraft();
    setSelectedVendor(vendor);
    setFoodStopModalVisible(true);
    const ll = parseVendorMapLatLng(vendor);
    if (ll) animateMapToPin(ll.lat, ll.lng);
  };

  const coins = userProfile?.irieCoins ?? DEFAULT_RIDER_COINS_FALLBACK;
  const hasRedeemBundle = coins >= 100;
  const canRedeem = canApplyCoinRedemption(userProfile, coins);

  useEffect(() => {
    if (!canApplyCoinRedemption(userProfile, coins) && useRedeem) {
      setUseRedeem(false);
    }
  }, [userProfile, coins, useRedeem]);

  const expandSheet = useCallback(() => {
    setSheetExpanded(true);
    Animated.spring(sheetProgress, {
      toValue: 1,
      friction: 11,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [sheetProgress]);

  const collapseSheet = useCallback(() => {
    setSheetExpanded(false);
    Animated.spring(sheetProgress, {
      toValue: 0,
      friction: 11,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [sheetProgress]);

  /** Avoid replaying the sheet spring on every address focus — that layout motion can dismiss the keyboard on Android. */
  const expandSheetIfCollapsed = useCallback(() => {
    if (!sheetExpanded) {
      setSheetExpanded(true);
      Animated.spring(sheetProgress, {
        toValue: 1,
        friction: 11,
        tension: 70,
        useNativeDriver: false,
      }).start();
    }
  }, [sheetExpanded, sheetProgress]);

  const editPickupOnMap = useCallback(() => {
    setDriverScanAtPickup(false);
    expandSheet();
    setMapPlacementPhase('pickup');
    requestAnimationFrame(() => {
      animateMapToPin(riderPickPin.latitude, riderPickPin.longitude);
    });
  }, [expandSheet, riderPickPin.latitude, riderPickPin.longitude, animateMapToPin]);

  const editDropoffOnMap = useCallback(() => {
    expandSheet();
    setMapPlacementPhase('dropoff');
    requestAnimationFrame(() => {
      animateMapToPin(riderDropPin.latitude, riderDropPin.longitude);
    });
  }, [expandSheet, riderDropPin.latitude, riderDropPin.longitude, animateMapToPin]);

  useEffect(() => {
    if (!loading) return undefined;
    let cancelled = false;
    const timeouts = [];
    const pulse = () => {
      if (cancelled || !mapRef.current) return;
      programmaticMapMove.current = true;
      mapRef.current.animateToRegion(
        {
          latitude: DEFAULT_JAMAICA_MAP_REGION.latitude,
          longitude: DEFAULT_JAMAICA_MAP_REGION.longitude,
          latitudeDelta: 0.4 / 3,
          longitudeDelta: 0.4 / 3,
        },
        2000,
      );
      timeouts.push(
        setTimeout(() => {
          programmaticMapMove.current = false;
        }, 2100),
      );
      timeouts.push(
        setTimeout(() => {
          if (cancelled || !mapRef.current) return;
          programmaticMapMove.current = true;
          mapRef.current.animateToRegion(
            {
              latitude: DEFAULT_JAMAICA_MAP_REGION.latitude,
              longitude: DEFAULT_JAMAICA_MAP_REGION.longitude,
              latitudeDelta: 0.15 / 3,
              longitudeDelta: 0.15 / 3,
            },
            2000,
          );
          timeouts.push(
            setTimeout(() => {
              programmaticMapMove.current = false;
            }, 2100),
          );
        }, 2300),
      );
    };
    pulse();
    const iv = setInterval(pulse, 5200);
    return () => {
      cancelled = true;
      clearInterval(iv);
      timeouts.forEach(clearTimeout);
    };
  }, [loading]);

  useEffect(() => {
    if (foodStopModalVisible) expandSheet();
  }, [foodStopModalVisible, expandSheet]);

  const toggleItem = (menuItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.id === menuItem.id);
      if (exists) return prev.filter((i) => i.id !== menuItem.id);
      return [...prev, menuItem];
    });
  };

  const isItemSelected = (menuItem) => selectedItems.some((i) => i.id === menuItem.id);

  const handleSelectVendor = (vendor) => {
    setSelectedVendor(vendor);
    setSelectedItems([]);
    const ll = parseVendorMapLatLng(vendor);
    if (ll) animateMapToPin(ll.lat, ll.lng);
  };

  const handleConfirmFoodStop = () => {
    if (!selectedVendor || selectedItems.length === 0) {
      Alert.alert(t('alerts.errorTitle'), t('riderHome.alertsSelectVendor'));
      return;
    }
    const waitMinutesAccrued = 0;
    const serviceFee = computeFoodStopServiceFee(waitMinutesAccrued);
    const itemsTotal = selectedItems.reduce((sum, i) => sum + (i.price || 0), 0);
    const notes = foodStopNotes.trim();
    const vLL = parseVendorMapLatLng(selectedVendor);
    const vLat = vLL?.lat;
    const vLng = vLL?.lng;
    const vendorAddr =
      typeof selectedVendor.address === 'string' ? selectedVendor.address.trim() : '';
    setFoodStop({
      vendorId: selectedVendor.id,
      vendorUserId: selectedVendor.uid || null,
      vendorName: selectedVendor.name,
      ...(vLL ? { vendorLat: vLat, vendorLng: vLng } : {}),
      ...(vendorAddr ? { vendorAddress: vendorAddr } : {}),
      items: selectedItems.map((i) => i.name),
      itemsWithPrices: selectedItems,
      itemsTotal,
      waitMinutesAccrued,
      extraFee: serviceFee,
      mapIconId: primaryMapIconFromMenuRows(selectedItems),
      ...(notes ? { notes } : {}),
    });
    setFoodStopModalVisible(false);
    setSelectedVendor(null);
    setSelectedItems([]);
    setFoodStopNotes('');
  };

  const handleRemoveFoodStop = () => {
    setFoodStop(null);
  };

  const getTotalFare = () => {
    const base = parseInt(bidPrice, 10) || 0;
    const validStops = stops.filter((s) => s?.trim()).length;
    const stopsFee = validStops * STOP_FEE;
    const foodItemsTotal = foodStop?.itemsTotal || 0;
    const foodStopServiceFee = foodStop
      ? computeFoodStopServiceFee(
          typeof foodStop.waitMinutesAccrued === 'number' ? foodStop.waitMinutesAccrued : 0,
        )
      : 0;
    const withFood = base + foodItemsTotal + foodStopServiceFee + stopsFee;
    const afterRedeem = withFood - (useRedeem ? REDEEM_DISCOUNT : 0);
    const promoDiscount = getPromoDiscount(promoCode, afterRedeem);
    return Math.max(0, afterRedeem - promoDiscount);
  };

  const getFareBreakdown = () => {
    const base = parseInt(bidPrice, 10) || 0;
    const validStops = stops.filter((s) => s?.trim()).length;
    const stopsFee = validStops * STOP_FEE;
    const foodItemsTotal = foodStop?.itemsTotal || 0;
    const foodStopServiceFee = foodStop
      ? computeFoodStopServiceFee(
          typeof foodStop.waitMinutesAccrued === 'number' ? foodStop.waitMinutesAccrued : 0,
        )
      : 0;
    const subtotal = base + foodItemsTotal + foodStopServiceFee + stopsFee;
    const redeemAmt = useRedeem && canRedeem ? REDEEM_DISCOUNT : 0;
    const afterRedeem = subtotal - redeemAmt;
    const promoDiscount = getPromoDiscount(promoCode, afterRedeem);
    const total = Math.max(0, afterRedeem - promoDiscount);
    return {
      base,
      validStops,
      stopsFee,
      foodItemsTotal,
      foodStopServiceFee,
      redeemAmt,
      promoDiscount,
      subtotal,
      total,
    };
  };

  const getStopsExtraMinutes = () => stops.filter((s) => s?.trim()).length * STOP_MINUTES;

  const addStop = () => {
    setDraftStop('');
  };

  const confirmStop = () => {
    if (draftStop === null) return;
    const trimmed = draftStop?.trim();
    if (trimmed) {
      setStops((prev) => [...prev, trimmed]);
    }
    setDraftStop(null);
  };

  const cancelDraftStop = () => {
    setDraftStop(null);
  };

  const updateStop = (index, value) => {
    setStops((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const removeStop = (index) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const goToOngoingRide = useCallback(() => {
    if (!ongoingRide) return;
    const r = ongoingRide;
    if (r.status === 'bidding') {
      navigation.navigate('Bidding', {
        rideId: r.id,
        bidPrice: r.bidPrice,
        pickup: r.pickup,
        dropoff: r.dropoff,
        foodStop: r.foodStop,
        stops: r.stops,
        useRedeem: !!r.useRedeem,
        pickupLatitude: r.pickupLatitude,
        pickupLongitude: r.pickupLongitude,
        dropoffLatitude: r.dropoffLatitude,
        dropoffLongitude: r.dropoffLongitude,
      });
      return;
    }
    expandSheet();
    if (r.status === 'accepted' && r.driverId) {
      navigation.navigate('ActiveRide', {
        rideId: r.id,
        driver: { id: r.driverId, name: r.driverName || 'Driver' },
        fare: r.finalFare ?? r.bidPrice,
        pickup: r.pickup,
        dropoff: r.dropoff,
        foodStop: r.foodStop,
        stops: r.stops,
        useRedeem: !!r.useRedeem,
      });
    }
  }, [ongoingRide, navigation, expandSheet]);

  /** Center on rider, then zoom out slowly so the search pulse and driver pins read in context. */
  const animateRideRequestSearchZoom = useCallback(async (center) => {
    if (
      !mapRef.current ||
      center == null ||
      typeof center.latitude !== 'number' ||
      typeof center.longitude !== 'number' ||
      Number.isNaN(center.latitude) ||
      Number.isNaN(center.longitude)
    ) {
      return;
    }
    for (let i = 0; i < 30 && !mapReadyRef.current; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, Platform.OS === 'android' ? 320 : 180));

    const map = mapRef.current;
    const { latitude, longitude } = center;
    const preScan = { latitude, longitude, ...mapRegionCloseOnPickup(latitude) };
    const searchWide = { latitude, longitude, ...mapRegionDeltasForSearchRadiusKm(latitude) };
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Armada/map] RiderHome pre-scan → search', {
        multiplier: RIDER_MAP_PRE_SCAN_ZOOM_MULTIPLIER,
        preScanDeltas: {
          latitudeDelta: preScan.latitudeDelta,
          longitudeDelta: preScan.longitudeDelta,
        },
        searchDeltas: {
          latitudeDelta: searchWide.latitudeDelta,
          longitudeDelta: searchWide.longitudeDelta,
        },
        center: { latitude, longitude },
      });
    }
    programmaticMapMove.current = true;
    await new Promise((resolve) => {
      map.animateToRegion(preScan, RIDE_REQUEST_SEARCH_ZOOM_IN_MS);
      setTimeout(resolve, RIDE_REQUEST_SEARCH_ZOOM_IN_MS + 100);
    });
    await new Promise((resolve) => {
      map.animateToRegion(searchWide, RIDE_REQUEST_SEARCH_ZOOM_OUT_MS);
      setTimeout(() => {
        programmaticMapMove.current = false;
        resolve();
      }, RIDE_REQUEST_SEARCH_ZOOM_OUT_MS + 200);
    });
  }, []);

  const useMyLocationForPickup = useCallback(async () => {
    expandSheet();
    setMapPlacementPhase('pickup');
    setDriverScanAtPickup(false);
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('riderHome.alertsLocationTitle'), t('riderHome.alertsLocationPickup'));
        return;
      }
      suppressPickupGeocodeFromHubUntilRef.current = Date.now() + 4000;
      if (pickupGeocodeTimerRef.current) {
        clearTimeout(pickupGeocodeTimerRef.current);
        pickupGeocodeTimerRef.current = null;
      }
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch (_) {
          /* user declined or unavailable */
        }
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
      });
      const { latitude, longitude } = pos.coords;
      pinFollowsDeviceLocationRef.current = true;
      setNearbyMapHub({ latitude, longitude });
      setRiderPickPin({ latitude, longitude });
      await resolveAddressForRiderPin(latitude, longitude);
      animateMapToPin(latitude, longitude);
    } catch (e) {
      Alert.alert(t('riderHome.alertsLocationTitle'), e?.message || t('riderHome.alertsLocationError'));
    } finally {
      setLocationLoading(false);
    }
  }, [expandSheet, animateMapToPin, resolveAddressForRiderPin, t]);

  const persistSavedSlot = async (slot, rawValue) => {
    const v = (rawValue || '').trim();
    if (!v) {
      Alert.alert(t('riderHome.alertsSavedTitle'), t('riderHome.alertsEnterAddress'));
      return;
    }
    if (!userProfile?.id) return;
    const next = { ...savedPlaces, [slot]: v };
    await saveSavedPlaces(userProfile.id, next);
    setSavedPlaces(next);
  };

  const applySavedToPickup = (slot) => {
    const v = savedPlaces[slot]?.trim();
    if (!v) {
      Alert.alert(
        t('riderHome.alertsSavedTitle'),
        slot === 'home' ? t('riderHome.alertsSetHomeHow') : t('riderHome.alertsSetWorkHow')
      );
      return;
    }
    expandSheet();
    setPickup(v);
  };

  const applySavedToDropoff = (slot) => {
    const v = savedPlaces[slot]?.trim();
    if (!v) {
      Alert.alert(
        t('riderHome.alertsSavedTitle'),
        slot === 'home' ? t('riderHome.alertsSaveHomeFirst') : t('riderHome.alertsSaveWorkFirst')
      );
      return;
    }
    expandSheet();
    setDropoff(v);
  };

  const submitRideRequestAndNavigate = useCallback(
    async ({ expandSheetIfFareInvalid = false } = {}) => {
      const totalFare = getTotalFare();
      if (!totalFare || totalFare < MIN_FARE_JMD) {
        if (expandSheetIfFareInvalid) expandSheet();
        Alert.alert(
          t('riderHome.alertsSetFareTitle'),
          t('riderHome.alertsMinFareBody', { min: formatJmdPrimary(MIN_FARE_JMD) }),
        );
        return;
      }
      setLoading(true);
      try {
        const validStops = stops.filter((s) => s?.trim());
        const stopsFee = validStops.length * STOP_FEE;
        const stopsMinutes = validStops.length * STOP_MINUTES;
        const riderUid = resolveAuthUid(user, userProfile);
        if (!riderUid) {
          Alert.alert(t('riderHome.alertsSignInTitle'), t('riderHome.alertsSignInBody'));
          return;
        }
        const rideData = {
          riderId: riderUid,
          riderName: userProfile?.name || 'Rider',
          pickup,
          dropoff,
          bidPrice: getTotalFare(),
          splitCount: splitCount > 1 ? splitCount : 1,
          status: 'bidding',
          pickupLatitude: riderPickPin.latitude,
          pickupLongitude: riderPickPin.longitude,
          dropoffLatitude: riderDropPin.latitude,
          dropoffLongitude: riderDropPin.longitude,
        };
        if (validStops.length > 0) {
          rideData.stops = validStops;
          rideData.stopsFee = stopsFee;
          rideData.stopsMinutes = stopsMinutes;
        }
        if (foodStop) {
          rideData.foodStop = foodStop;
        }
        if (useRedeem) {
          rideData.useRedeem = true;
        }
        const rideId = await createRideRequest(rideData);
        if (riderUid) {
          addRoute(riderUid, pickup, dropoff).then((next) => {
            if (Array.isArray(next)) setRouteHistory(next);
          });
        }
        setDriverScanAtPickup(false);
        setPopupVendor(null);
        setRidePlanningGeneration((g) => {
          const next = g + 1;
          setFoodStopPopupDismissedGeneration(next);
          return next;
        });

        const hub = {
          latitude: riderPickPin.latitude,
          longitude: riderPickPin.longitude,
        };
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setNearbyMapHub({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          }
        } catch (_) {
          /* keep hub for map overlay */
        }
        await animateRideRequestSearchZoom(hub);

        navigation.navigate('Bidding', {
          rideId,
          bidPrice: getTotalFare(),
          foodStop,
          stops: stops.filter((s) => s && String(s).trim()),
          useRedeem,
          pickup,
          dropoff,
          pickupLatitude: riderPickPin.latitude,
          pickupLongitude: riderPickPin.longitude,
          dropoffLatitude: riderDropPin.latitude,
          dropoffLongitude: riderDropPin.longitude,
        });
      } catch (e) {
        Alert.alert(
          t('riderHome.alertsCannotRequestTitle'),
          e.message || t('riderHome.alertsCannotRequestBody'),
        );
      } finally {
        setLoading(false);
      }
    },
    [
      bidPrice,
      stops,
      user,
      userProfile,
      pickup,
      dropoff,
      splitCount,
      foodStop,
      useRedeem,
      riderPickPin.latitude,
      riderPickPin.longitude,
      riderDropPin.latitude,
      riderDropPin.longitude,
      expandSheet,
      animateRideRequestSearchZoom,
      navigation,
      promoCode,
      canRedeem,
      t,
      formatJmdPrimary,
    ],
  );

  const handleRequestRide = () => {
    void submitRideRequestAndNavigate({ expandSheetIfFareInvalid: false });
  };

  const confirmRouteSummaryOnMap = useCallback(() => {
    setDriverScanAtPickup(true);
    collapseSheet();
    void submitRideRequestAndNavigate({ expandSheetIfFareInvalid: true });
  }, [collapseSheet, submitRideRequestAndNavigate]);

  /** Food popup: primary action requests the ride and opens the driver-scanning (Bidding) screen. */
  const goToDriverScanningFromFoodPopup = useCallback(() => {
    void submitRideRequestAndNavigate({ expandSheetIfFareInvalid: true });
  }, [submitRideRequestAndNavigate]);

  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const closeFoodModal = () => {
    setFoodStopModalVisible(false);
    setFoodStopNotes('');
  };
  const topChromeHeight = insets.top + EST_TOP_TAB_HEADER;
  const tabBarReserve = EST_BOTTOM_TAB_BAR + Math.max(insets.bottom, Platform.OS === 'android' ? 0 : 6);
  /** Keep the map primary: expanded sheet stays just under half the screen (not full height minus chrome). */
  const RIDER_SHEET_MAX_SCREEN_FRACTION = 0.46;
  const riderPanelMaxHeight = Math.max(
    280,
    Math.min(
      Math.round(windowHeight * RIDER_SHEET_MAX_SCREEN_FRACTION),
      windowHeight - topChromeHeight - tabBarReserve - 10,
    ),
  );
  /** Bottom sheet: scroll area = panel max height minus sheet padding (not double-counted). */
  const sheetPadTop = 12;
  const sheetBottomInset = Math.max(insets.bottom, 12);
  const riderFormScrollHeight = Math.max(
    200,
    riderPanelMaxHeight - sheetPadTop - sheetBottomInset,
  );
  const animatedSheetMaxHeight = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [COLLAPSED_SHEET_HEIGHT, riderPanelMaxHeight],
  });
  const foodSheetMaxHeight = Math.max(320, Math.floor(windowHeight * 0.88));
  /** Handle + title row + actions + paddings — scroll area must be bounded or the sheet clips content. */
  const foodModalScrollMaxHeight = Math.max(160, foodSheetMaxHeight - 216);
  const menuItemsForVendor = (v) =>
    v.menu || v.items?.map((n) => ({ id: n, name: n, price: 0 })) || [];

  const ongoingRideBannerHidden =
    !!ongoingRide && dismissedBiddingBannerRideId === ongoingRide.id;
  const showActiveRideBanner = !!ongoingRide && !ongoingRideBannerHidden;

  return (
    <View style={styles.container}>
      <RentalCounterOfferModal
        visible={!!rentalCounterReq}
        request={rentalCounterReq}
        onClose={() => setRentalCounterReq(null)}
      />
      <View style={styles.mapColumn} pointerEvents="box-none">
        <ConnectivityBanner
          isOffline={isOffline}
          mapLoadFailed={mapLoadFailed}
          firebaseReady={isFirebaseReady}
          showCachedHint={isOffline && routeHistory.length > 0}
          onRetry={() => {
            setMapLoadFailed(false);
            NetInfo.fetch();
            setRiderHomeMapRemountKey((k) => k + 1);
          }}
          style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, zIndex: 25 }}
        />
        <View style={styles.mapShell} collapsable={false}>
        <MapView
          key={`rider-home-map-${riderHomeMapRemountKey}`}
          ref={mapRef}
          style={styles.mapAbsoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={RIDER_HOME_INITIAL_MAP_REGION}
          mapPadding={{ top: 44, bottom: 28, left: 14, right: 14 }}
          {...(Platform.OS === 'android' ? { loadingEnabled: true, googleRenderer: 'LEGACY' } : {})}
          moveOnMarkerPress={false}
          showsTraffic={false}
          showsPointsOfInterest
          showsBuildings
          showsUserLocation
          onMapReady={() => {
            mapReadyRef.current = true;
          }}
          onError={() => setMapLoadFailed(true)}
          onPress={onMapPressPlacement}
          onPanDrag={() => {
            if (programmaticMapMove.current) return;
            pinFollowsDeviceLocationRef.current = false;
            userMapPanActiveRef.current = true;
            onMapPanDrag();
          }}
          onRegionChangeComplete={onMapRegionChangeComplete}
        >
        <DemandHeatmapLayer
          visible={heatmapFeatureOn && showDemandHeatmap}
          region={heatmapRegion}
          vendorPins={vendorPinsForHeat}
          coolColor={theme.colors.primary}
          hotColor={theme.colors.accent}
        />
        {mapPlacementPhase === 'fareReview' || mapPlacementPhase === 'done' ? (
          <DropoffMapMarker
            key="rider-home-dropoff-flag"
            coordinate={{ latitude: riderDropPin.latitude, longitude: riderDropPin.longitude }}
            title="Dropoff"
            description="Destination"
          />
        ) : null}
        {showFoodVendorMarkers
          ? vendors.map((v) => {
              const ll = parseVendorMapLatLng(v);
              if (!ll) return null;
              const selectedOnMap = (foodStop?.vendorId ?? selectedVendor?.id) === v.id;
              return (
                <FoodStopMapMarker
                  key={v.id}
                  coordinate={{ latitude: ll.lat, longitude: ll.lng }}
                  title={v.name}
                  description={selectedOnMap ? 'Selected · food stop' : 'Food pickup'}
                  selected={selectedOnMap}
                  accentColor={theme.colors.orange}
                  menuIconId={
                    foodStop?.vendorId === v.id
                      ? foodStop.mapIconId ?? v.mapMenuIconId
                      : v.mapMenuIconId
                  }
                  onPress={() => {
                    setSelectedVendor(v);
                    setFoodStopModalVisible(true);
                    animateMapToPin(ll.lat, ll.lng);
                  }}
                />
              );
            })
          : null}
        <NearbyDriversMapOverlay
          center={driverOverlayCenter}
          visible={showNearbyDriverMarkers}
          isSearching={driverScanAtPickup || loading || ongoingRide?.status === 'bidding'}
          pauseAnimations={pauseAnimations}
        />
        </MapView>
        {heatmapFeatureOn ? (
          <View
            style={[styles.demandHeatOuter, { bottom: Math.max(insets.bottom, 8) + 8, left: 12 }]}
            pointerEvents="box-none"
          >
            <View style={styles.demandHeatColumn} pointerEvents="box-none">
              <Pressable
                style={[
                  styles.demandHeatPill,
                  {
                    backgroundColor: showDemandHeatmap ? theme.colors.primary + '12' : theme.colors.surface,
                    borderColor: showDemandHeatmap ? theme.colors.primary : theme.colors.primaryLight,
                  },
                ]}
                onPress={() => {
                  setShowDemandHeatmap((prev) => {
                    const next = !prev;
                    if (next) {
                      const r = mapRegionRef.current;
                      if (
                        r?.latitude != null &&
                        r.latitudeDelta != null &&
                        r.longitude != null &&
                        r.longitudeDelta != null
                      ) {
                        setHeatmapRegion({
                          latitude: r.latitude,
                          longitude: r.longitude,
                          latitudeDelta: r.latitudeDelta,
                          longitudeDelta: r.longitudeDelta,
                        });
                      }
                    }
                    return next;
                  });
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={
                  showDemandHeatmap ? t('riderHome.a11yHeatOff') : t('riderHome.a11yHeatOn')
                }
              >
                <View style={[styles.demandHeatIconWrap, { backgroundColor: theme.colors.primary + '18' }]}>
                  <Ionicons
                    name={showDemandHeatmap ? 'analytics' : 'analytics-outline'}
                    size={16}
                    color={theme.colors.primary}
                  />
                </View>
                <Text style={[styles.demandHeatPillLabel, { color: theme.colors.text }]}>
                  {t('riderHome.activity')}
                </Text>
              </Pressable>
              {showDemandHeatmap ? (
                <DemandHeatmapLegend
                  visible
                  coolColor={theme.colors.primary}
                  hotColor={theme.colors.accent}
                  textColor={theme.colors.text}
                  mutedColor={theme.colors.textSecondary}
                  borderColor={theme.colors.primaryLight}
                  panelBg={theme.colors.card}
                  title={t('riderHome.heatmapTitle')}
                  labelLower={t('riderHome.heatmapLower')}
                  labelHigher={t('riderHome.heatmapHigher')}
                  hint={t('riderHome.heatmapHint')}
                />
              ) : null}
            </View>
          </View>
        ) : null}
        {mapPlacementPhase === 'pickup' || mapPlacementPhase === 'dropoff' ? (
          <View
            style={styles.pickupCrosshair}
            pointerEvents="none"
            accessibilityLabel={mapPlacementPhase === 'pickup' ? 'Pickup map center' : 'Destination map center'}
          >
            {mapPlacementPhase === 'pickup' ? (
              <View style={styles.pickupCrosshairIcon} pointerEvents="none">
                <RiderMapIcon width={MAP_MARKER_RIDER_ICON_DP} height={MAP_MARKER_RIDER_ICON_DP} />
              </View>
            ) : (
              <View style={styles.pickupCrosshairIcon} pointerEvents="none">
                <DropoffMapIcon width={MAP_MARKER_DROPOFF_W_DP} height={MAP_MARKER_DROPOFF_W_DP} />
              </View>
            )}
          </View>
        ) : null}
        {!mapSetupCardDismissed ? (
        <View
          style={[
            styles.pinCalloutCard,
            {
              top: insets.top + 8,
              borderColor:
                mapPlacementPhase === 'dropoff'
                  ? `${RIDER_DESTINATION_RED}55`
                  : mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview'
                    ? theme.colors.success + '55'
                    : `${RIDER_PICKUP_GREEN}4D`,
            },
          ]}
          accessibilityRole="summary"
          accessibilityLabel={
            mapPlacementPhase === 'pickup'
              ? 'Pickup on map'
              : mapPlacementPhase === 'dropoff'
                ? 'Destination on map'
                : mapPlacementPhase === 'fareReview'
                  ? 'Review fare and send request'
                  : 'Pickup and destination summary'
          }
        >
          <Pressable
            style={styles.pinCalloutCloseBtn}
            onPress={() => setMapSetupCardDismissed(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Hide map pickup and destination card"
          >
            <Ionicons name="close-circle" size={26} color={theme.colors.textSecondary} />
          </Pressable>
          <View style={styles.pinCalloutRow}>
            <View
              style={[
                styles.pinCalloutIconWrap,
                {
                  backgroundColor:
                    mapPlacementPhase === 'dropoff'
                      ? `${RIDER_DESTINATION_RED}1F`
                      : mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview'
                        ? theme.colors.success + '22'
                        : `${RIDER_PICKUP_GREEN}1F`,
                },
              ]}
            >
              <Ionicons
                name={
                  mapPlacementPhase === 'pickup'
                    ? 'location-sharp'
                    : mapPlacementPhase === 'dropoff'
                      ? 'flag'
                      : mapPlacementPhase === 'fareReview'
                        ? 'cash-outline'
                        : 'checkmark-circle'
                }
                size={22}
                color={
                  mapPlacementPhase === 'dropoff'
                    ? RIDER_DESTINATION_RED
                    : mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview'
                      ? theme.colors.success
                      : RIDER_PICKUP_GREEN
                }
              />
            </View>
            <View style={styles.pinCalloutTextCol}>
              <View style={styles.pinCalloutLabelRow}>
                <Text
                  style={[
                    styles.pinCalloutTitle,
                    mapPlacementPhase === 'pickup'
                      ? styles.pinCalloutTitlePickup
                      : mapPlacementPhase === 'dropoff'
                        ? styles.pinCalloutTitleDestination
                        : mapPlacementPhase === 'fareReview'
                          ? { color: theme.colors.text }
                          : { color: theme.colors.success },
                  ]}
                >
                  {mapPlacementPhase === 'pickup'
                    ? 'Pickup location'
                    : mapPlacementPhase === 'dropoff'
                      ? 'Destination'
                      : mapPlacementPhase === 'fareReview'
                        ? 'Your offer'
                        : 'Pickup & destination set'}
                </Text>
                {mapPlacementPhase === 'pickup' && riderPickPinGeocoding ? (
                  <ActivityIndicator size="small" color={RIDER_PICKUP_GREEN} style={styles.pinCalloutSpinner} />
                ) : null}
                {mapPlacementPhase === 'dropoff' && riderDropPinGeocoding ? (
                  <ActivityIndicator size="small" color={RIDER_DESTINATION_RED} style={styles.pinCalloutSpinner} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.pinCalloutBody,
                  {
                    color:
                      mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview'
                        ? theme.colors.textSecondary
                        : mapPlacementPhase === 'dropoff'
                          ? dropoff?.trim()
                            ? theme.colors.text
                            : theme.colors.textSecondary
                          : riderPickPinLabel || pickup?.trim()
                            ? theme.colors.text
                            : theme.colors.textSecondary,
                  },
                ]}
                numberOfLines={mapPlacementPhase === 'done' || mapPlacementPhase === 'fareReview' ? 5 : 3}
              >
                {mapPlacementPhase === 'pickup'
                  ? riderPickPinGeocoding
                    ? t('riderHome.mapLookupPickup')
                    : riderPickPinLabel ||
                      pickup?.trim() ||
                      t('riderHome.mapHintPickup')
                  : mapPlacementPhase === 'dropoff'
                    ? riderDropPinGeocoding
                      ? t('riderHome.mapLookupDropoff')
                      : dropoff?.trim() ||
                        t('riderHome.mapHintDropoff')
                    : t('riderHome.mapSummaryLine', {
                        pickup: pickup || '—',
                        dropoff: dropoff || '—',
                      })}
              </Text>
            </View>
          </View>
          {mapPlacementPhase === 'pickup' ? (
            <TouchableOpacity
              style={[
                styles.mapBubblePrimaryBtn,
                { backgroundColor: RIDER_PICKUP_GREEN_SOLID },
                (riderPickPinGeocoding || !pickup?.trim()) && styles.mapBubblePrimaryBtnDisabled,
              ]}
              onPress={confirmPickupOnMap}
              disabled={riderPickPinGeocoding || !pickup?.trim()}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Confirm pickup location"
            >
              <Text style={styles.mapBubblePrimaryBtnText}>{t('riderHome.confirmPickup')}</Text>
            </TouchableOpacity>
          ) : null}
          {mapPlacementPhase === 'dropoff' ? (
            <TouchableOpacity
              style={[
                styles.mapBubblePrimaryBtn,
                { backgroundColor: RIDER_DESTINATION_RED },
                (riderDropPinGeocoding || !dropoff?.trim()) && styles.mapBubblePrimaryBtnDisabled,
              ]}
              onPress={confirmDropoffOnMap}
              disabled={riderDropPinGeocoding || !dropoff?.trim()}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Confirm destination"
            >
              <Text style={styles.mapBubblePrimaryBtnText}>{t('riderHome.confirmDestination')}</Text>
            </TouchableOpacity>
          ) : null}
          {mapPlacementPhase === 'fareReview' ? (
            <>
              {fareSuggestion.status === 'loading' ? (
                <View style={styles.mapFareSuggestRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={[styles.mapFareSuggestHint, { color: theme.colors.textSecondary }]}>
                    {t('riderHome.fareSuggestLoading')}
                  </Text>
                </View>
              ) : fareSuggestion.status === 'ok' && fareSuggestion.amount != null ? (
                <Text style={[styles.mapFareSuggestLine, { color: theme.colors.text }]}>
                  {t('riderHome.fareSuggestPrefix')}
                  {formatJmdPrimary(fareSuggestion.amount)}
                  {fareSuggestion.roadKm != null
                    ? t('riderHome.fareSuggestKm', { km: fareSuggestion.roadKm.toFixed(1) })
                    : ''}
                  {fareSuggestion.durationMin != null
                    ? t('riderHome.fareSuggestMin', { min: fareSuggestion.durationMin })
                    : ''}
                </Text>
              ) : (
                <Text style={[styles.mapFareSuggestHint, { color: theme.colors.textSecondary }]}>
                  {t('riderHome.fareSuggestSetBelow')}
                </Text>
              )}
              <Text style={[styles.mapFareInputLabel, { color: theme.colors.textSecondary }]}>
                {t('riderHome.bidLabelMap')}
              </Text>
              <ThemedTextInput
                style={[styles.mapFareInput, { borderColor: theme.colors.primaryLight, color: theme.colors.text }]}
                value={bidPrice}
                onChangeText={(t) => {
                  bidManuallyEditedRef.current = true;
                  setBidManuallyTouched(true);
                  setBidPrice(t);
                }}
                keyboardType="number-pad"
                placeholder={t('riderHome.minBasePlaceholder', { min: formatJmdPrimary(MIN_FARE_JMD) })}
                placeholderTextColor={theme.colors.textSecondary}
                accessibilityLabel="Your bid amount in Jamaican dollars"
              />
              {fareSuggestion.status === 'ok' && fareSuggestion.amount != null && bidManuallyTouched ? (
                <TouchableOpacity
                  style={[styles.mapFareUseSuggestedBtn, { borderColor: theme.colors.primary }]}
                  onPress={() => {
                    bidManuallyEditedRef.current = false;
                    setBidManuallyTouched(false);
                    setBidPrice(String(fareSuggestion.amount));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.mapFareUseSuggestedText, { color: theme.colors.primary }]}>
                    {t('riderHome.useSuggestedFare')}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.mapBubblePrimaryBtn,
                  { backgroundColor: theme.colors.success },
                  loading && styles.mapBubblePrimaryBtnDisabled,
                ]}
                onPress={confirmRouteSummaryOnMap}
                disabled={loading}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Send ride request to drivers"
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.mapBubblePrimaryBtnText}>{t('riderHome.sendRequest')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapFareBackBtn, { borderColor: theme.colors.primaryLight }]}
                onPress={() => setMapPlacementPhase('dropoff')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Go back to adjust destination on map"
              >
                <Text style={[styles.mapFareBackBtnText, { color: RIDER_DESTINATION_RED }]}>
                  {t('riderHome.backAdjustDest')}
                </Text>
              </TouchableOpacity>
              <View style={styles.mapBubbleEditRow}>
                <TouchableOpacity
                  style={[styles.mapBubbleEditBtn, { borderColor: `${RIDER_PICKUP_GREEN}66` }]}
                  onPress={editPickupOnMap}
                  accessibilityRole="button"
                  accessibilityLabel="Edit pickup on map"
                >
                  <Text style={[styles.mapBubbleEditBtnText, { color: RIDER_PICKUP_GREEN }]}>
                    {t('riderHome.editPickup')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mapBubbleEditBtn, { borderColor: `${RIDER_DESTINATION_RED}66` }]}
                  onPress={editDropoffOnMap}
                  accessibilityRole="button"
                  accessibilityLabel="Edit destination on map"
                >
                  <Text style={[styles.mapBubbleEditBtnText, { color: RIDER_DESTINATION_RED }]}>
                    {t('riderHome.editDestination')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
          {mapPlacementPhase === 'done' ? (
            <>
              <TouchableOpacity
                style={[
                  styles.mapBubblePrimaryBtn,
                  { backgroundColor: theme.colors.success },
                  loading && styles.mapBubblePrimaryBtnDisabled,
                ]}
                onPress={confirmRouteSummaryOnMap}
                disabled={loading}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Find drivers for this pickup and destination"
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.mapBubblePrimaryBtnText}>{t('riderHome.findDrivers')}</Text>
                )}
              </TouchableOpacity>
              <View style={styles.mapBubbleEditRow}>
                <TouchableOpacity
                  style={[styles.mapBubbleEditBtn, { borderColor: `${RIDER_PICKUP_GREEN}66` }]}
                  onPress={editPickupOnMap}
                  accessibilityRole="button"
                  accessibilityLabel="Edit pickup on map"
                >
                  <Text style={[styles.mapBubbleEditBtnText, { color: RIDER_PICKUP_GREEN }]}>
                    {t('riderHome.editPickup')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mapBubbleEditBtn, { borderColor: `${RIDER_DESTINATION_RED}66` }]}
                  onPress={editDropoffOnMap}
                  accessibilityRole="button"
                  accessibilityLabel="Edit destination on map"
                >
                  <Text style={[styles.mapBubbleEditBtnText, { color: RIDER_DESTINATION_RED }]}>
                    {t('riderHome.editDestination')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
        ) : (
          <Pressable
            style={[styles.mapSetupRestoreChip, { top: insets.top + 8 }]}
            onPress={() => setMapSetupCardDismissed(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Show map pickup and destination card"
          >
            <Ionicons name="map-outline" size={18} color={theme.colors.primary} />
            <Text style={[styles.mapSetupRestoreChipText, { color: theme.colors.primary }]}>
              {t('riderHome.mapSetup')}
            </Text>
          </Pressable>
        )}
        {showActiveRideBanner && !sheetExpanded ? (
          <View style={[styles.activeRideBanner, { bottom: 14 }]}>
            <TouchableOpacity
              style={styles.activeRideBannerMain}
              onPress={goToOngoingRide}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={
                ongoingRide.status === 'bidding'
                  ? 'Continue finding drivers for your ride'
                  : 'Open your ride in progress'
              }
            >
              <Ionicons name="navigate-circle" size={20} color={theme.colors.white} />
              <View style={styles.activeRideBannerTextCol}>
                <Text style={styles.activeRideBannerTitle}>
                  {ongoingRide.status === 'bidding'
                    ? t('riderHome.findingDrivers')
                    : t('riderHome.rideInProgress')}
                </Text>
                <Text style={styles.activeRideBannerSub} numberOfLines={1}>
                  {t('riderHome.tapOpen', {
                    pickup: ongoingRide.pickup || t('riderHome.fallbackPickup'),
                    dropoff: ongoingRide.dropoff || t('riderHome.fallbackDropoff'),
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.white} style={{ opacity: 0.9 }} />
            </TouchableOpacity>
            <Pressable
              style={styles.activeRideBannerDismiss}
              onPress={() => setDismissedBiddingBannerRideId(ongoingRide.id)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Minimize ride status bar"
            >
              <Ionicons name="close" size={22} color={theme.colors.white} style={{ opacity: 0.95 }} />
            </Pressable>
          </View>
        ) : null}
        </View>
      </View>
      {popupVendor && (
        <View
          style={[
            styles.foodPopup,
            {
              top: insets.top + 10,
            },
          ]}
          accessibilityRole="alert"
        >
          <Text style={styles.foodPopupTitle}>{t('riderHome.foodTitle')}</Text>
          <Text style={styles.foodPopupVendor}>
            {t('riderHome.foodOnRoute', { name: popupVendor.name })}
          </Text>
          <TouchableOpacity
            style={[
              styles.foodPopupPrimaryBtn,
              { backgroundColor: theme.colors.primary },
              loading && { opacity: 0.55 },
            ]}
            onPress={goToDriverScanningFromFoodPopup}
            disabled={loading}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Search for drivers"
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.onPrimary} size="small" />
            ) : (
              <Text style={styles.foodPopupPrimaryBtnText}>{t('riderHome.foodSearchDrivers')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.foodPopupSecondaryBtn}
            onPress={() => handlePopupAddStop(popupVendor)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Add ${popupVendor.name} as food stop`}
          >
            <Text style={styles.foodPopupSecondaryBtnText}>
              {t('riderHome.foodAddStop', { name: popupVendor.name })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.foodPopupDismiss}
            onPress={() => {
              setPopupVendor(null);
              dismissFoodStopRoutePopupForThisDraft();
            }}
          >
            <Text style={styles.foodPopupDismissText}>{t('riderHome.foodNotNow')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Animated.View
        style={[
          styles.riderSheet,
          {
            maxHeight: animatedSheetMaxHeight,
            paddingTop: sheetExpanded ? sheetPadTop : 8,
            paddingBottom: sheetBottomInset,
          },
        ]}
      >
        {sheetExpanded ? (
        <>
        <TouchableOpacity
          style={styles.sheetCollapseStrip}
          onPress={collapseSheet}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Collapse ride planning panel"
          accessibilityHint="Hides the form and shows more of the map"
        >
          <View style={styles.sheetHandleBarWide} />
          <View style={styles.sheetCollapseInner}>
            <Ionicons name="chevron-down" size={22} color={theme.colors.primary} />
            <Text style={[styles.sheetCollapseLabel, { color: theme.colors.textSecondary }]}>
              {t('riderHome.minimize')}
            </Text>
          </View>
        </TouchableOpacity>
        <ScrollView
          style={[
            styles.riderPanelScroll,
            { height: Math.max(160, riderFormScrollHeight - RIDER_SHEET_COLLAPSE_STRIP_HEIGHT) },
          ]}
          contentContainerStyle={styles.riderPanelScrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator
          nestedScrollEnabled
          removeClippedSubviews={false}
          bounces
        >
          {showActiveRideBanner ? (
          <View style={[styles.ongoingRideSheetNudge, { borderColor: theme.colors.primaryLight }]}>
            <TouchableOpacity
              style={styles.ongoingRideSheetNudgeMain}
              onPress={goToOngoingRide}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={
                ongoingRide.status === 'bidding'
                  ? 'Continue finding drivers for your ride'
                  : 'Open your ride in progress'
              }
            >
              <Ionicons name="navigate-circle" size={22} color={theme.colors.primary} />
              <View style={styles.ongoingRideSheetNudgeTextCol}>
                <Text style={[styles.ongoingRideSheetNudgeTitle, { color: theme.colors.primary }]}>
                  {ongoingRide.status === 'bidding'
                    ? t('riderHome.findingDrivers')
                    : t('riderHome.rideInProgress')}
                </Text>
                <Text style={[styles.ongoingRideSheetNudgeSub, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                  {t('riderHome.tapOpen', {
                    pickup: ongoingRide.pickup || t('riderHome.fallbackPickup'),
                    dropoff: ongoingRide.dropoff || t('riderHome.fallbackDropoff'),
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDismissedBiddingBannerRideId(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Show ride status on map again"
            >
              <Text style={[styles.ongoingRideSheetNudgeMapLink, { color: theme.colors.accent }]}>
                {t('riderHome.showOnMap')}
              </Text>
            </TouchableOpacity>
          </View>
          ) : null}
        <View style={styles.card}>
          <Text style={[styles.riderScreenTitle, { color: theme.colors.text }]}>{t('riderHome.screenTitle')}</Text>
          <View style={styles.riderTopLinksRow}>
            <TouchableOpacity
              style={styles.pastTripsPill}
              onPress={() => {
                expandSheet();
                navigation.navigate('RiderPastRides');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.pastTripsPillText, { color: theme.colors.primary }]}>
                {t('riderHome.pastTrips')}
              </Text>
            </TouchableOpacity>
            {routeHistory.length > 0 && !recentRoutesExpanded ? (
              <TouchableOpacity
                style={styles.recentCollapsedPill}
                onPress={() => {
                  expandSheet();
                  setRecentRoutesExpanded(true);
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('riderHome.recentRoutes')}
              >
                <Ionicons name="time-outline" size={16} color={theme.colors.accent} />
                <Text
                  style={[styles.recentCollapsedPillText, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {t('riderHome.recentRoutesCollapsed', { count: routeHistory.length })}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          {routeHistory.length > 0 && recentRoutesExpanded ? (
            <View style={styles.recentRoutes}>
              <View style={styles.recentHeaderRow}>
                <TouchableOpacity
                  style={styles.recentHeaderToggle}
                  onPress={() => setRecentRoutesExpanded(false)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: true }}
                  accessibilityLabel="Collapse recent routes"
                >
                  <Ionicons name="chevron-up" size={18} color={theme.colors.primary} />
                  <Text style={styles.recentHeaderTitle}>{t('riderHome.recentRoutes')}</Text>
                  <Text style={styles.recentHeaderCount}>({routeHistory.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    expandSheet();
                    navigation.navigate('RiderRouteHistory');
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.seeAllLink}>{t('riderHome.seeAll')}</Text>
                </TouchableOpacity>
              </View>
              {routeHistory.slice(0, 3).map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.recentChip}
                  onPress={() => {
                    expandSheet();
                    setPickup(r.pickup);
                    setDropoff(r.dropoff);
                    setMapPlacementPhase('done');
                  }}
                >
                  <Text style={styles.recentChipText} numberOfLines={1}>
                    {r.pickup} → {r.dropoff}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={styles.fieldLabelRow}>
            <Text style={[styles.fieldLabel, styles.fieldLabelPickup]}>{t('riderHome.pickup')}</Text>
            <View style={styles.saveLabelActions}>
              <TouchableOpacity
                onPress={() => persistSavedSlot('home', pickup)}
                style={styles.fieldSaveIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('riderHome.saveAsHome')}
                accessibilityRole="button"
              >
                <Ionicons name="home-outline" size={19} color={theme.colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => persistSavedSlot('work', pickup)}
                style={styles.fieldSaveIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('riderHome.saveAsWork')}
                accessibilityRole="button"
              >
                <Ionicons name="briefcase-outline" size={19} color={theme.colors.accent} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.shortcutRow}>
            <TouchableOpacity
              style={[styles.shortcutChip, locationLoading && styles.shortcutChipDisabled]}
              onPress={useMyLocationForPickup}
              disabled={locationLoading}
            >
              <Text style={styles.shortcutChipText}>
                {locationLoading ? t('riderHome.locating') : t('riderHome.myLocation')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcutChip} onPress={() => applySavedToPickup('home')}>
              <Text style={styles.shortcutChipText}>{t('riderHome.home')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcutChip} onPress={() => applySavedToPickup('work')}>
              <Text style={styles.shortcutChipText}>{t('riderHome.work')}</Text>
            </TouchableOpacity>
          </View>
          <AddressSuggestInput
            wrapStyle={{ zIndex: 24 }}
            fieldKind="pickup"
            value={pickup}
            onChangeText={setPickup}
            originLatitude={nearbyMapHub.latitude}
            originLongitude={nearbyMapHub.longitude}
            onPlaceSelected={({ description, latitude, longitude }) => {
              setPickup(description);
              setRiderPickPin({ latitude, longitude });
              setRiderPickPinLabel(description);
              pinFollowsDeviceLocationRef.current = false;
            }}
            placeholder={t('riderHome.pickupPlaceholder')}
            onFocus={expandSheetIfCollapsed}
            inputStyle={styles.locationFieldInput}
            textContentType="location"
            autoCorrect
            accessibilityLabel="Pickup address"
          />
          <View style={[styles.fieldLabelRow, styles.fieldLabelAfterBlock]}>
            <Text style={[styles.fieldLabel, styles.fieldLabelDestination, styles.fieldLabelNoMb]}>
              {t('riderHome.destination')}
            </Text>
            <View style={styles.saveLabelActions}>
              <TouchableOpacity
                onPress={() => persistSavedSlot('home', dropoff)}
                style={styles.fieldSaveIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('riderHome.saveAsHome')}
                accessibilityRole="button"
              >
                <Ionicons name="home-outline" size={19} color={theme.colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => persistSavedSlot('work', dropoff)}
                style={styles.fieldSaveIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('riderHome.saveAsWork')}
                accessibilityRole="button"
              >
                <Ionicons name="briefcase-outline" size={19} color={theme.colors.accent} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.shortcutRow}>
            <TouchableOpacity style={styles.shortcutChip} onPress={() => applySavedToDropoff('home')}>
              <Text style={styles.shortcutChipText}>{t('riderHome.home')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcutChip} onPress={() => applySavedToDropoff('work')}>
              <Text style={styles.shortcutChipText}>{t('riderHome.work')}</Text>
            </TouchableOpacity>
          </View>
          <AddressSuggestInput
            wrapStyle={{ zIndex: 22 }}
            fieldKind="destination"
            value={dropoff}
            onChangeText={setDropoff}
            originLatitude={nearbyMapHub.latitude}
            originLongitude={nearbyMapHub.longitude}
            onPlaceSelected={({ description, latitude, longitude }) => {
              setDropoff(description);
              setRiderDropPin({ latitude, longitude });
            }}
            placeholder={t('riderHome.destPlaceholder')}
            onFocus={expandSheetIfCollapsed}
            inputStyle={styles.locationFieldInput}
            textContentType="fullStreetAddress"
            autoCorrect
            accessibilityLabel="Destination address"
          />
          {fareSuggestion.status === 'loading' ? (
            <View style={styles.fareSuggestRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.fareSuggestHint, { color: theme.colors.textSecondary }]}>
                {t('riderHome.fareSuggestUpdating')}
              </Text>
            </View>
          ) : fareSuggestion.status === 'ok' ? (
            <View style={[styles.fareSuggestCard, { borderColor: theme.colors.primaryLight }]}>
              <Text style={[styles.fareSuggestText, { color: theme.colors.text }]}>
                {t('riderHome.fareSuggestPanel', { amount: formatJmdPrimary(fareSuggestion.amount) })}
                {fareSuggestion.roadKm != null
                  ? t('riderHome.fareSuggestKm', { km: fareSuggestion.roadKm.toFixed(1) })
                  : ''}
                {fareSuggestion.durationMin != null
                  ? t('riderHome.fareSuggestMin', { min: fareSuggestion.durationMin })
                  : ''}
                {fareSuggestion.extraTrafficMin != null
                  ? t('riderHome.fareTraffic', {
                      min: Math.max(1, Math.round(fareSuggestion.extraTrafficMin)),
                    })
                  : ''}
              </Text>
              {fareSuggestion.source === 'straight-line' ? (
                <Text style={[styles.fareSuggestHint, { color: theme.colors.textSecondary }]}>
                  {t('riderHome.fareStraightLineHint')}
                </Text>
              ) : null}
              {bidManuallyTouched ? (
                <TouchableOpacity
                  style={[styles.fareSuggestUseBtn, { borderColor: theme.colors.primary }]}
                  onPress={() => {
                    bidManuallyEditedRef.current = false;
                    setBidManuallyTouched(false);
                    setBidPrice(String(fareSuggestion.amount));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.fareSuggestUseText, { color: theme.colors.primary }]}>
                    {t('riderHome.useSuggestedFareBtn')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {stops.map((stop, i) => (
            <View key={`stop-${i}`} style={styles.stopRow}>
              <AddressSuggestInput
                wrapStyle={{ flex: 1, marginBottom: 0, zIndex: 20 - i }}
                fieldKind="pickup"
                value={stop}
                onChangeText={(v) => updateStop(i, v)}
                originLatitude={riderPickPin.latitude}
                originLongitude={riderPickPin.longitude}
                onPlaceSelected={({ description }) => updateStop(i, description)}
                placeholder={t('riderHome.stopPlaceholder', { n: i + 1 })}
                onFocus={expandSheet}
                inputStyle={styles.locationFieldInput}
                textContentType="fullStreetAddress"
                autoCorrect
                accessibilityLabel={`Stop ${i + 1} address`}
              />
              <TouchableOpacity style={styles.removeStopBtn} onPress={() => removeStop(i)}>
                <Text style={styles.removeStopText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {draftStop !== null ? (
            <View style={styles.stopRow}>
              <AddressSuggestInput
                wrapStyle={{ flex: 1, marginBottom: 0, zIndex: 20 - stops.length }}
                fieldKind="pickup"
                value={draftStop}
                onChangeText={setDraftStop}
                originLatitude={riderPickPin.latitude}
                originLongitude={riderPickPin.longitude}
                onPlaceSelected={({ description }) => setDraftStop(description)}
                placeholder={t('riderHome.stopPlaceholder', { n: stops.length + 1 })}
                onFocus={expandSheet}
                inputStyle={styles.locationFieldInput}
                textContentType="fullStreetAddress"
                autoCorrect
                accessibilityLabel={`Stop ${stops.length + 1} address`}
                autoFocus
              />
              <TouchableOpacity style={styles.confirmStopBtn} onPress={confirmStop}>
                <Text style={styles.confirmStopText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.removeStopBtn} onPress={cancelDraftStop}>
                <Text style={styles.removeStopText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addStopBtn}
              onPress={() => {
                expandSheet();
                addStop();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.addStopText}>{t('riderHome.addStop')}</Text>
            </TouchableOpacity>
          )}
          {stops.filter((s) => s?.trim()).length > 0 && (
            <View style={styles.stopsFeeRow}>
              <Text style={styles.extraFeeText}>
                {t('riderHome.extraStopsFee', {
                  fee: formatJmdPrimary(stops.filter((s) => s?.trim()).length * STOP_FEE),
                  count: stops.filter((s) => s?.trim()).length,
                })}
              </Text>
              <Text style={styles.stopsTimeText}>
                {t('riderHome.extraStopsMin', { mins: getStopsExtraMinutes() })}
              </Text>
            </View>
          )}
          <View style={styles.bidRow}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.bidLabel}>{t('riderHome.bidLabel')}</Text>
              <VoiceBiddingButton
                onResult={(val) => {
                  bidManuallyEditedRef.current = true;
                  setBidManuallyTouched(true);
                  setBidPrice(val || '');
                }}
              />
            </View>
            <ThemedTextInput
              style={styles.bidInput}
              value={bidPrice}
              onChangeText={(t) => {
                bidManuallyEditedRef.current = true;
                setBidManuallyTouched(true);
                setBidPrice(t);
              }}
              onFocus={expandSheet}
              keyboardType="number-pad"
              placeholder={t('riderHome.bidPlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TouchableOpacity
              style={styles.applyDefaultsLinkBtn}
              onPress={async () => {
                expandSheet();
                if (!userProfile?.id) {
                  Alert.alert(t('riderHome.alertsDefaultsSignInTitle'), t('riderHome.alertsDefaultsSignInBody'));
                  return;
                }
                const p = await getRiderPreferences(userProfile.id);
                const b = parseInt(String(p.defaultBid || '').replace(/\D/g, ''), 10);
                if (b >= MIN_FARE_JMD) {
                  bidManuallyEditedRef.current = true;
                  setBidManuallyTouched(true);
                  setBidPrice(String(b));
                }
                setSplitCount(p.defaultSplitCount || 1);
                Alert.alert(t('riderHome.alertsDefaultsAppliedTitle'), t('riderHome.alertsDefaultsAppliedBody'));
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.applyDefaultsLinkText, { color: theme.colors.primary }]}>
                {t('riderHome.applyDefaultsLink')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.secondaryPairRow}>
            <TouchableOpacity
              style={[styles.secondaryPairBtn, { borderColor: theme.colors.success + '88' }]}
              onPress={() => {
                expandSheet();
                navigation.navigate('RentACar', { pickupText: pickup });
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="car-outline" size={20} color={theme.colors.success} />
              <Text style={[styles.secondaryPairTitle, { color: theme.colors.success }]} numberOfLines={2}>
                {t('riderHome.rentCarTitle')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.secondaryPairBtn,
                { borderColor: foodStop ? theme.colors.primary : theme.colors.primaryLight },
                foodStop && { backgroundColor: theme.colors.primary + '20' },
              ]}
              onPress={() => {
                expandSheet();
                setFoodStopModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="restaurant"
                size={20}
                color={foodStop ? theme.colors.primary : theme.colors.primary}
              />
              <Text
                style={[styles.secondaryPairTitle, { color: theme.colors.primary }]}
                numberOfLines={foodStop ? 3 : 2}
              >
                {foodStop
                  ? t('riderHome.foodStopLine', {
                      vendor: foodStop.vendorName,
                      items: foodStop.itemsTotal || 0,
                      fee: formatJmdPrimary(computeFoodStopServiceFee(foodStop.waitMinutesAccrued ?? 0)),
                    })
                  : t('riderHome.foodStopAdd')}
              </Text>
            </TouchableOpacity>
          </View>
          {foodStop && (
            <>
              <Text style={styles.extraFeeText}>
                {t('riderHome.foodStopFeeLine', {
                  items: foodStop.itemsTotal || 0,
                  fee: formatJmdPrimary(computeFoodStopServiceFee(foodStop.waitMinutesAccrued ?? 0)),
                  base: formatJmdPrimary(FOOD_STOP_SERVICE_BASE_JMD),
                  perBlock: formatJmdPrimary(FOOD_STOP_WAIT_PER_BLOCK_JMD),
                  blockMin: FOOD_STOP_WAIT_BLOCK_MINUTES,
                })}
              </Text>
              {foodStop.notes ? (
                <Text style={styles.foodStopNotePreview} numberOfLines={3}>
                  {t('riderHome.noteKitchen', { note: foodStop.notes })}
                </Text>
              ) : null}
              <TouchableOpacity style={styles.removeFoodStop} onPress={handleRemoveFoodStop}>
                <Text style={styles.removeFoodStopText}>{t('riderHome.removeFoodStop')}</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.savingsHeaderRow, { borderColor: theme.colors.primaryLight }]}
            onPress={() => setSavingsSectionExpanded((e) => !e)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ expanded: savingsSectionExpanded }}
            accessibilityLabel={t('riderHome.savingsToggle')}
          >
            <Ionicons name="pricetag-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.savingsHeaderTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {t('riderHome.savingsToggle')}
            </Text>
            <Ionicons
              name={savingsSectionExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
          {savingsSectionExpanded ? (
            <View style={styles.savingsSectionBody}>
              {hasRedeemBundle && (
                <View style={{ marginBottom: 8 }}>
                  <TouchableOpacity
                    style={[
                      styles.redeemToggle,
                      useRedeem && canRedeem && styles.redeemToggleActive,
                      !canRedeem && styles.redeemToggleDisabled,
                    ]}
                    onPress={() => canRedeem && setUseRedeem(!useRedeem)}
                    activeOpacity={canRedeem ? 0.7 : 1}
                  >
                    <Text style={[styles.redeemToggleText, !canRedeem && styles.redeemToggleTextMuted]}>
                      {useRedeem && canRedeem ? '✓ ' : ''}
                      {t('riderHome.useCoins', {
                        coins: REDEEM_RATE,
                        discount: formatJmdPrimary(REDEEM_DISCOUNT),
                      })}
                    </Text>
                  </TouchableOpacity>
                  {!canRedeem && (
                    <Text style={styles.redeemLimitHint}>{t('riderHome.redeemLimitFull')}</Text>
                  )}
                </View>
              )}
              <View style={styles.promoRow}>
                <ThemedTextInput
                  style={styles.promoInput}
                  placeholder={t('riderHome.promoPlaceholder')}
                  value={promoCode}
                  onChangeText={(v) => { setPromoCode(v.toUpperCase()); setPromoError(''); }}
                  onFocus={expandSheet}
                  placeholderTextColor={theme.colors.textSecondary}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.promoBtn}
                  onPress={() => {
                    const r = validatePromo(promoCode, parseInt(bidPrice, 10) || 0);
                    if (r.valid) setPromoError(t('riderHome.promoApplied', { amount: formatJmdPrimary(r.discount) }));
                    else setPromoError(r.error || t('riderHome.promoInvalid'));
                  }}
                >
                  <Text style={styles.promoBtnText}>{t('riderHome.applyPromo')}</Text>
                </TouchableOpacity>
              </View>
              {promoError ? (
                <Text
                  style={[styles.promoMsg, String(promoError).includes('off') && styles.promoSuccess]}
                >
                  {promoError}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.totalFareRow}>
            <Text style={[styles.totalFare, { marginBottom: 0, flex: 1 }]}>
              {t('riderHome.totalFare', { amount: formatJmd(getTotalFare()) })}
            </Text>
            <TouchableOpacity
              onPress={() => setFareDetailsExpanded((e) => !e)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
            >
              <Text style={[styles.fareDetailsToggleText, { color: theme.colors.accent }]}>
                {fareDetailsExpanded ? t('riderHome.fareDetailsHide') : t('riderHome.fareDetailsShow')}
              </Text>
            </TouchableOpacity>
          </View>
          {fareDetailsExpanded ? (
            <View style={styles.fareBreakdown}>
              <Text style={styles.fareBreakdownTitle}>{t('riderHome.fareBreakdownTitle')}</Text>
              {(() => {
                const fb = getFareBreakdown();
                return (
                  <>
                    <Text style={styles.fareBreakLine}>
                      {t('riderHome.fbBase', { amount: formatJmd(fb.base) })}
                    </Text>
                    {fb.validStops > 0 ? (
                      <Text style={styles.fareBreakLine}>
                        {t('riderHome.fbStops', {
                          count: fb.validStops,
                          amount: formatJmd(fb.stopsFee),
                        })}
                      </Text>
                    ) : null}
                    {fb.foodItemsTotal > 0 || fb.foodStopServiceFee > 0 ? (
                      <Text style={styles.fareBreakLine}>
                        {t('riderHome.fbFood', {
                          items: fb.foodItemsTotal.toLocaleString(),
                          fee: formatJmd(fb.foodStopServiceFee),
                        })}
                      </Text>
                    ) : null}
                    {fb.redeemAmt > 0 ? (
                      <Text style={styles.fareBreakLine}>
                        {t('riderHome.fbCoins', { amount: formatJmd(-fb.redeemAmt) })}
                      </Text>
                    ) : null}
                    {fb.promoDiscount > 0 ? (
                      <Text style={styles.fareBreakLine}>
                        {t('riderHome.fbPromo', { amount: formatJmd(-fb.promoDiscount) })}
                      </Text>
                    ) : null}
                  </>
                );
              })()}
            </View>
          ) : null}
          <View style={styles.splitSection}>
            <Text style={styles.label}>{t('riderHome.splitTitle')}</Text>
            <View style={styles.splitRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.splitBtn, splitCount === n && styles.splitBtnActive]}
                  onPress={() => {
                    expandSheet();
                    setSplitCount(n);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.splitText, splitCount === n && styles.splitTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {splitCount > 1 && (
              <Text style={styles.perPersonText}>
                {t('riderHome.perPerson', {
                  amount: formatJmdPrimary(Math.ceil(getTotalFare() / splitCount)),
                  count: splitCount,
                })}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRequestRide}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? t('riderHome.requesting') : t('riderHome.requestRide')}
            </Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
        </>
        ) : (
          <TouchableOpacity
            style={[
              styles.sheetPeekOuter,
              { borderTopColor: theme.colors.primary, backgroundColor: theme.colors.surface },
            ]}
            onPress={expandSheet}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Open ride planning form"
          >
            <View
              style={[
                styles.sheetPeekArrowBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Ionicons name="chevron-up" size={28} color={theme.colors.onPrimary} />
            </View>
            <View style={styles.sheetPeekTextCol}>
              <View style={styles.sheetPeekTitleRow}>
                <Text style={[styles.sheetPeekTitle, { color: theme.colors.text }]}>
                  {t('riderHome.planRide')}
                </Text>
                <View style={[styles.sheetPeekChip, { backgroundColor: theme.colors.primary + '22' }]}>
                  <Text style={[styles.sheetPeekChipText, { color: theme.colors.primary }]}>
                    {t('riderHome.tapToOpen')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sheetPeekSub, { color: theme.colors.textSecondary }]}>
                {t('riderHome.sheetPeekSub')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </Animated.View>

      <Modal
        visible={foodStopModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeFoodModal}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeFoodModal}
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
          />
          <View
            style={[
              styles.modalSheet,
              {
                maxHeight: foodSheetMaxHeight,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{t('riderHome.modalFoodTitle')}</Text>
              <TouchableOpacity
                onPress={closeFoodModal}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close food stop picker"
              >
                <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedVendor && parseVendorMapLatLng(selectedVendor) ? (
              <Text
                style={[styles.vendorMapHint, { color: theme.colors.textSecondary }]}
                numberOfLines={2}
              >
                {t('riderHome.vendorMapHint')}
              </Text>
            ) : null}
            <ScrollView
              style={[styles.modalScroll, { maxHeight: foodModalScrollMaxHeight }]}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              bounces
            >
              {vendors.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.vendorCard, selectedVendor?.id === item.id && styles.vendorCardActive]}
                  onPress={() => handleSelectVendor(item)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.vendorName}>{item.name}</Text>
                  <Text style={styles.vendorItems}>
                    {(item.menu || item.items || []).map((m) => (typeof m === 'string' ? m : m.name)).join(', ') ||
                      t('riderHome.noMenu')}
                  </Text>
                  {selectedVendor?.id === item.id && (
                    <Text style={styles.detourFee}>
                      {t('riderHome.stopFeeLine', {
                        base: formatJmdPrimary(FOOD_STOP_SERVICE_BASE_JMD),
                        perBlock: formatJmdPrimary(FOOD_STOP_WAIT_PER_BLOCK_JMD),
                        blockMin: FOOD_STOP_WAIT_BLOCK_MINUTES,
                      })}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
              {selectedVendor ? (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsLabel}>{t('riderHome.selectItems')}</Text>
                  {menuItemsForVendor(selectedVendor).map((raw) => {
                    const menuItem = typeof raw === 'string' ? { id: raw, name: raw, price: 0 } : raw;
                    const key = String(menuItem.id ?? menuItem.name);
                    const selected = isItemSelected(menuItem);
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.itemRow, selected && styles.itemRowActive]}
                        onPress={() => toggleItem(menuItem)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.menuItemIconSlot}>
                          <VendorMenuItemIcon
                            iconId={menuItem.icon}
                            size={26}
                            color={selected ? theme.colors.onPrimary : theme.colors.primary}
                          />
                        </View>
                        <Text style={[styles.itemText, styles.itemTextWithIcon]}>{menuItem.name}</Text>
                        <View style={styles.itemPriceRow}>
                          <Text style={styles.itemPrice}>{formatJmdPrimary(menuItem.price ?? 0)}</Text>
                          <Text style={styles.itemCheck}>{selected ? '✓' : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {selectedItems.length > 0 && (
                    <Text style={styles.itemsSubtotal}>
                      {t('riderHome.subtotal', {
                        amount: formatJmdPrimary(selectedItems.reduce((s, i) => s + (i.price || 0), 0)),
                      })}
                    </Text>
                  )}
                  {selectedItems.length > 0 && (
                    <View style={styles.foodNotesSection}>
                      <Text style={styles.foodNotesLabel}>{t('riderHome.specialInstructions')}</Text>
                      <ThemedTextInput
                        style={styles.foodNotesInput}
                        value={foodStopNotes}
                        onChangeText={setFoodStopNotes}
                        placeholder={t('riderHome.allergiesPh')}
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline
                        maxLength={500}
                        textAlignVertical="top"
                      />
                      <Text style={styles.foodNotesCount}>{foodStopNotes.length}/500</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeFoodModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmFoodStop}>
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default withSectionGuide(RiderHomeScreen, 'rider_home');

const createStyles = (theme, isDark = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  /** Flex column + map flex:1 keeps the form sheet above the map on Android (SurfaceView z-order). */
  mapColumn: { flex: 1, minHeight: 160 },
  /** Map + radar: shell gives a bounded box; overlay sits above the map on Android (elevation). */
  mapShell: { flex: 1, position: 'relative', minHeight: 160 },
  mapAbsoluteFill: { ...StyleSheet.absoluteFillObject },
  /** Pickup is always the geographic point under this icon (pan map or tap to recenter). */
  pickupCrosshair: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  pickupCrosshairIcon: {
    marginTop: -32,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      default: {},
    }),
  },
  pinCalloutCloseBtn: {
    position: 'absolute',
    top: 6,
    right: 4,
    zIndex: 3,
    padding: 4,
  },
  mapSetupRestoreChip: {
    position: 'absolute',
    right: theme.spacing.md,
    zIndex: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.primaryLight,
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      default: {},
    }),
  },
  mapSetupRestoreChipText: { fontSize: 13, fontWeight: '800' },
  demandHeatOuter: {
    position: 'absolute',
    zIndex: 24,
    alignItems: 'flex-start',
  },
  demandHeatColumn: {
    gap: 8,
    maxWidth: 268,
  },
  demandHeatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingRight: 14,
    borderRadius: 12,
    borderWidth: 1,
    ...Platform.select({
      android: { elevation: 5 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      default: {},
    }),
  },
  demandHeatIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demandHeatPillLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  ongoingRideSheetNudge: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      default: {},
    }),
  },
  ongoingRideSheetNudgeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ongoingRideSheetNudgeTextCol: { flex: 1, minWidth: 0 },
  ongoingRideSheetNudgeTitle: { fontSize: 15, fontWeight: '800' },
  ongoingRideSheetNudgeSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  ongoingRideSheetNudgeMapLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
  },
  pinCalloutCard: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    maxWidth: 400,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md - 2,
    paddingTop: 8,
    paddingBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.primary + '24',
    zIndex: 20,
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: {},
    }),
  },
  pinCalloutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pinCalloutIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm + 2,
  },
  pinCalloutTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingTop: 1,
  },
  pinCalloutLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  pinCalloutTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  pinCalloutTitlePickup: {
    color: RIDER_PICKUP_GREEN,
  },
  pinCalloutTitleDestination: {
    color: RIDER_DESTINATION_RED,
  },
  pinCalloutSpinner: { marginLeft: 4 },
  pinCalloutBody: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  mapBubblePrimaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBubblePrimaryBtnDisabled: { opacity: 0.52 },
  mapBubblePrimaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.onPrimary,
    letterSpacing: -0.2,
  },
  mapBubbleEditRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  mapBubbleEditBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: theme.colors.background,
  },
  mapBubbleEditBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  mapFareSuggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  mapFareSuggestHint: { fontSize: 12, lineHeight: 16, flex: 1 },
  mapFareSuggestLine: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 8 },
  mapFareInputLabel: { fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  mapFareInput: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '800',
  },
  mapFareUseSuggestedBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
  },
  mapFareUseSuggestedText: { fontSize: 13, fontWeight: '800' },
  mapFareBackBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  mapFareBackBtnText: { fontSize: 14, fontWeight: '800' },
  riderSheet: {
    flexShrink: 1,
    paddingHorizontal: 16,
    overflow: 'visible',
    zIndex: 10,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? theme.colors.primaryLight + '44' : theme.colors.primaryLight + '77',
    ...riderBottomSheetShadow(isDark),
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  /** Sheet “Pickup” — bright green */
  fieldLabelPickup: {
    color: RIDER_PICKUP_GREEN,
  },
  /** Sheet “Destination” — bright red */
  fieldLabelDestination: {
    color: RIDER_DESTINATION_RED,
  },
  fieldLabelAfterBlock: { marginTop: 12 },
  riderPanelScroll: {},
  riderPanelScrollContent: {
    paddingBottom: 28,
  },
  sheetCollapseStrip: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.primaryLight + '55',
  },
  sheetHandleBarWide: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textSecondary + (isDark ? '66' : '40'),
    marginBottom: 6,
  },
  sheetCollapseInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetCollapseLabel: { fontSize: 13, fontWeight: '700' },
  sheetPeekOuter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: COLLAPSED_SHEET_HEIGHT - 8,
    borderTopWidth: 2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    ...riderCardElevation(isDark),
  },
  sheetPeekArrowBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  sheetPeekTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetPeekChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sheetPeekChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  sheetPeekTextCol: { flex: 1 },
  sheetPeekTitle: { fontSize: 17, fontWeight: '800' },
  sheetPeekSub: { fontSize: 13, marginTop: 4, lineHeight: 18, fontWeight: '500' },
  cardScroll: { maxHeight: 420 },
  cardScrollContent: { paddingTop: 4, paddingBottom: 20 },
  recentRoutes: { marginBottom: 12 },
  recentHeaderToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingVertical: 4,
    marginRight: 8,
  },
  recentHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
    flexShrink: 1,
  },
  recentHeaderCount: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  recentChip: {
    backgroundColor: theme.colors.surface,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  recentChipText: { fontSize: 13, color: theme.colors.primary },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.primaryLight + '66',
    paddingBottom: 8,
  },
  seeAllLink: { fontSize: 13, fontWeight: '700', color: theme.colors.accent },
  fieldLabelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  fieldLabelNoMb: { marginBottom: 0 },
  saveLabelActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  saveLabelLink: { fontSize: 11, fontWeight: '700', color: theme.colors.accent },
  saveLabelSep: { fontSize: 11, color: theme.colors.textSecondary, marginHorizontal: 4 },
  shortcutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  shortcutChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '18',
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  shortcutChipDisabled: { opacity: 0.65 },
  shortcutChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  activeRideBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primaryDark || theme.colors.primary,
    gap: 2,
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      default: {},
    }),
  },
  activeRideBannerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  activeRideBannerDismiss: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRideBannerTextCol: { flex: 1, minWidth: 0 },
  activeRideBannerTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.white, letterSpacing: -0.2 },
  activeRideBannerSub: { fontSize: 11, color: theme.colors.white, opacity: 0.9, marginTop: 1 },
  fareBreakdown: {
    marginTop: 0,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  fareBreakdownTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  fareBreakLine: { fontSize: 13, color: theme.colors.text, marginBottom: 4, lineHeight: 18 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: isDark ? theme.colors.primaryLight + '55' : theme.colors.primaryLight + 'CC',
    ...riderCardElevation(isDark),
  },
  riderScreenTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  riderTopLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  pastTripsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.primaryLight,
  },
  pastTripsPillText: { fontSize: 14, fontWeight: '700' },
  recentCollapsedPill: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.primaryLight,
  },
  recentCollapsedPillText: { flex: 1, fontSize: 13, fontWeight: '600' },
  fieldSaveIconBtn: {
    padding: 4,
    marginLeft: 2,
    borderRadius: 8,
  },
  applyDefaultsLinkBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  applyDefaultsLinkText: { fontSize: 13, fontWeight: '700' },
  secondaryPairRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  secondaryPairBtn: {
    flex: 1,
    minHeight: 76,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryPairTitle: { fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  savingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: theme.colors.background,
  },
  savingsHeaderTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  savingsSectionBody: { marginBottom: 6, marginTop: -2 },
  totalFareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  fareDetailsToggleText: { fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
  },
  /** Text only — `AddressSuggestInput` draws the visible field shell (border + fill). */
  locationFieldInput: {
    marginBottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  fareSuggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 4,
  },
  fareSuggestCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    marginBottom: 10,
    backgroundColor: theme.colors.background,
  },
  fareSuggestText: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  fareSuggestHint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  fareSuggestUseBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
  },
  fareSuggestUseText: { fontSize: 14, fontWeight: '800' },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stopInput: { flex: 1, marginBottom: 0 },
  removeStopBtn: { padding: 8, backgroundColor: theme.colors.error + '30', borderRadius: 8 },
  removeStopText: { color: theme.colors.error, fontWeight: 'bold', fontSize: 14 },
  confirmStopBtn: { padding: 8, backgroundColor: theme.colors.success + '30', borderRadius: 8 },
  confirmStopText: { color: theme.colors.success, fontWeight: 'bold', fontSize: 14 },
  addStopBtn: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addStopText: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  rentCarBtn: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.success + '12',
  },
  rentCarBtnTitle: {
    color: theme.colors.success,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  rentCarBtnSub: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  bidRow: { marginBottom: 12 },
  applyDefaultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.primaryLight,
    backgroundColor: theme.colors.primary + '0D',
  },
  applyDefaultsText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  label: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  bidLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.accent,
    letterSpacing: 0.2,
  },
  bidInput: {
    backgroundColor: theme.colors.secondary + '4D',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    borderWidth: 3,
    borderColor: theme.colors.accent,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  foodStopBtn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '18',
  },
  foodStopBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  foodStopBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  foodStopBtnText: {
    flex: 1,
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  foodStopBtnTextActive: {
    color: theme.colors.onPrimary,
  },
  extraFeeText: {
    fontSize: 14,
    color: theme.colors.accent,
    marginBottom: 4,
    fontWeight: '600',
  },
  foodStopNotePreview: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  stopsFeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stopsTimeText: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600' },
  removeFoodStop: { marginBottom: 8 },
  removeFoodStopText: { fontSize: 12, color: theme.colors.error },
  redeemToggle: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.background,
  },
  redeemToggleActive: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.green + '20',
  },
  redeemToggleDisabled: { opacity: 0.55 },
  redeemToggleText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  redeemToggleTextMuted: { color: theme.colors.textSecondary },
  redeemLimitHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  promoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  promoInput: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 2, borderColor: theme.colors.primaryLight },
  promoBtn: { paddingHorizontal: 16, justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: 8 },
  promoBtnText: { color: theme.colors.white, fontWeight: 'bold', fontSize: 14 },
  promoMsg: { fontSize: 12, color: theme.colors.error, marginBottom: 4 },
  promoSuccess: { color: theme.colors.success },
  totalFare: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  splitSection: { marginBottom: 16 },
  splitRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  perPersonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accent,
    marginTop: 4,
  },
  splitBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLight + '99',
  },
  splitBtnActive: { backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.secondary },
  splitText: { color: theme.colors.primary, fontWeight: 'bold' },
  splitTextActive: { color: theme.colors.white },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    ...riderPrimaryButtonLift(theme),
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: theme.colors.onPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 6,
    width: '100%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.primaryLight + '55',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textSecondary + '35',
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: theme.colors.primary },
  vendorMapHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  modalScroll: { width: '100%' },
  modalScrollContent: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  vendorCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  vendorCardActive: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orange + '15' },
  vendorName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  vendorItems: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  detourFee: { fontSize: 12, color: theme.colors.accent, marginTop: 4 },
  itemsSection: { marginTop: 8, marginBottom: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.primaryLight },
  itemsLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: theme.colors.background,
  },
  itemRowActive: { backgroundColor: theme.colors.orange + '20', borderWidth: 1, borderColor: theme.colors.orange },
  menuItemIconSlot: { width: 32, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  itemText: { fontSize: 14, flex: 1 },
  itemTextWithIcon: { marginLeft: 0 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemPrice: { fontSize: 14, fontWeight: '600', color: theme.colors.accent },
  itemCheck: { color: theme.colors.success, fontWeight: 'bold' },
  itemsSubtotal: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginTop: 8 },
  foodNotesSection: { marginTop: 16 },
  foodNotesLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 },
  foodNotesInput: {
    minHeight: 88,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  foodNotesCount: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'right' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.primaryLight },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
  },
  modalCancelText: { color: theme.colors.textSecondary },
  modalConfirm: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: { color: theme.colors.white, fontWeight: 'bold' },
  foodPopup: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: theme.colors.orange,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
  },
  foodPopupTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  foodPopupVendor: { fontSize: 14, color: theme.colors.text, marginBottom: 4 },
  foodPopupHint: { fontSize: 12, color: theme.colors.orange, fontWeight: '600', marginBottom: 8 },
  foodPopupPrimaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
  },
  foodPopupPrimaryBtnText: { fontSize: 15, fontWeight: '800', color: theme.colors.onPrimary },
  foodPopupSecondaryBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center' },
  foodPopupSecondaryBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  foodPopupDismiss: { alignSelf: 'flex-end', marginTop: 6 },
  foodPopupDismissText: { fontSize: 12, color: theme.colors.textSecondary },
});
