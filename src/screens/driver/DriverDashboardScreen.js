import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Switch,
  Alert,

  Modal,
  Pressable,
  Platform,
  ScrollView,
  Image,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import ThemedTextInput from '../../components/ThemedTextInput';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView as KeyboardControllerAvoidingView,
} from 'react-native-keyboard-controller';
import MovingDriverMapMarker from '../../components/MovingDriverMapMarker';
import RiderMapMarker from '../../components/RiderMapMarker';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { REDEEM_DISCOUNT } from '../../services/iriCoinsService';
import { navigate as rootNavigate } from '../../navigation/navigationRef';
import {
  subscribeToBiddingRides,
  addBid,
  updateDriverOnlineStatus,
  updateDriverLocation,
  subscribeToBids,
  subscribeToDriverActiveRide,
  subscribeToRide,
  recordDriverDeclinedOffer,
} from '../../services/rideService';
import { updateFoodOrderStatus, subscribeToFoodOrder } from '../../services/foodOrderService';
import { FOOD_ORDER_STATUS_LABEL, normalizeFoodOrderStatus } from '../../constants/foodOrderStatus';
import * as Haptics from 'expo-haptics';
import { isFirebaseReady } from '../../config/firebase';
import { db } from '../../config/firestore';
import { getCurrentAuthUid, getUserProfile } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { withSectionGuide } from '../../components/withSectionGuide';
import { notifyDriverSplitFareLocal } from '../../services/notificationService';
import { playRideRequestSound, playBidAcceptedSound } from '../../utils/appSounds';
import { getDriverEarnings } from '../../services/earningsService';
import { getRidePickupCoords, getRideDropoffCoords, getRideExtraStopNavTargets } from '../../utils/ridePickupCoords';
import {
  filterBiddingRidesForDriverFeed,
  isBiddingRideWithinAge,
  BIDDING_POPUP_MAX_AGE_MS,
  BIDDING_RIDE_MAX_AGE_MS,
} from '../../utils/driverBiddingFeedFilter';
import { getFoodStopNavLatLngForRide } from '../../utils/foodStopCoords';
import { directionsAlertActions } from '../../utils/openNavigation';
import { DRIVER_MAP_REGION } from '../../constants/mapRegionDefaults';
import { MIN_FARE_JMD } from '../../utils/fareUtils';
import BiddingActivityBanner from '../../components/BiddingActivityBanner';
import DriverFareGradeTag from '../../components/DriverFareGradeTag';
import { getDriverFoodStopCardCopy } from '../../utils/driverStopsView';
import {
  getDriverEarnsFromRide,
  getDriverFareGrade,
  riderAllInFromDriverEarns,
  driverEarnsFromRiderAllIn,
  getVendorFoodItemsTotal,
} from '../../utils/rideFareBreakdown';
import {
  getDriverDailyFeeJmd,
  getReferralFirstDayFeeJmd,
  isDriverFleetAccessAllowed,
  getDriverTrialDaysRemaining,
  isWithinSevenDayDriverTrial,
  isSubscriptionActive,
} from '../../services/driverSubscriptionService';

/** Bottom sheet in Modal: avoid + aware scroll so the counter field stays above the keyboard (Android + iOS). */
function RespondModalKeyboardScroll({ scrollRef, insetsBottom, children, style, contentContainerStyle }) {
  const extra = Math.max(24, (insetsBottom || 0) + 24);
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        ref={scrollRef}
        style={style}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      bottomOffset={40}
      extraKeyboardSpace={extra}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

/** Modal sheets need explicit avoiding; `KeyboardAwareScrollView` alone often misses focused inputs. */
function RespondModalKeyboardAvoid({ children, style }) {
  if (Platform.OS === 'web') {
    return <View style={style}>{children}</View>;
  }
  return (
    <KeyboardControllerAvoidingView behavior="padding" keyboardVerticalOffset={0} style={style}>
      {children}
    </KeyboardControllerAvoidingView>
  );
}

const SUBSCRIPTION_INFO_KEY = 'armada_driver_subscription_info_seen';
const DRIVER_REJECTED_RIDES_KEY = 'armada_driver_rejected_ride_ids';
/** Ride IDs where this driver placed a bid — listen for rider counters */
const DRIVER_PENDING_BID_RIDES_KEY = 'armada_driver_pending_bid_rides';

/** One-line style summary for cards (avoid long A → B → C → D chains). */
function formatRequestRouteSummary(pickup, dropoff, stops, t) {
  const p = String(pickup ?? '').trim() || t('driverDashboard.routePickupFallback');
  const d = String(dropoff ?? '').trim() || t('driverDashboard.routeDestFallback');
  const n = Array.isArray(stops) ? stops.filter((s) => s && String(s).trim()).length : 0;
  const stopWord =
    n === 1 ? t('driverDashboard.routeStopSingular') : t('driverDashboard.routeStopPlural');
  const extra = n > 0 ? ` · +${n} ${stopWord}` : '';
  return `${p} → ${d}${extra}`;
}

const bidDocCreatedMs = (b) => {
  const c = b?.createdAt;
  if (c == null) return 0;
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  return 0;
};

const RIDE_CARD_WIDTH = 252;
const RIDE_CARD_GAP = 10;

function DriverDashboardScreen() {
  const { theme } = useTheme();
  const { t, formatJmdPrimary, currencyCode, usdTable } = useLocale();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const respondModalSheetHeight = useMemo(
    () => Math.round(windowHeight * 0.88),
    [windowHeight],
  );
  const tabNavigation = useNavigation();
  const route = useRoute();
  const { userProfile, user } = useAuth();
  const driverUid = getCurrentAuthUid(user) || userProfile?.id;
  const fleetAccessBlocked =
    isFirebaseReady &&
    userProfile?.role === 'driver' &&
    !isDriverFleetAccessAllowed(userProfile);
  const trialDaysRemaining = useMemo(() => getDriverTrialDaysRemaining(userProfile), [userProfile]);
  const isDriverRole =
    userProfile?.role === 'driver' ||
    (Array.isArray(userProfile?.roles) && userProfile.roles.includes('driver'));
  const showTrialFinalWeekBanner = useMemo(() => {
    if (fleetAccessBlocked) return false;
    if (!userProfile || !isDriverRole) return false;
    if (!isWithinSevenDayDriverTrial(userProfile)) return false;
    const d = trialDaysRemaining;
    return d != null && d >= 1 && d <= 7;
  }, [fleetAccessBlocked, userProfile, trialDaysRemaining, isDriverRole]);

  const showTrialSyncBanner = useMemo(() => {
    if (fleetAccessBlocked) return false;
    if (!userProfile || !isDriverRole) return false;
    if (!isDriverFleetAccessAllowed(userProfile)) return false;
    if (userProfile.profileIncomplete === true) return false;
    if (userProfile.driverSevenDayTrialEndsAt) return false;
    return !isSubscriptionActive(userProfile.driverSubscription, userProfile);
  }, [fleetAccessBlocked, userProfile, isDriverRole]);

  useFocusEffect(
    useCallback(() => {
      if (!showTrialSyncBanner || !driverUid) return undefined;
      const key = `armada_trial_sync_prompt_${driverUid}_${new Date().toISOString().slice(0, 10)}`;
      let cancelled = false;
      (async () => {
        try {
          const done = await AsyncStorage.getItem(key);
          if (done || cancelled) return;
          await AsyncStorage.setItem(key, '1');
          Alert.alert(
            t('driverProfile.trialSyncPromptTitle'),
            t('driverProfile.trialSyncPromptBody'),
            [{ text: t('common.done') }],
          );
        } catch (_) {}
      })();
      return () => {
        cancelled = true;
      };
    }, [showTrialSyncBanner, driverUid, t]),
  );
  const [rejectedRideIds, setRejectedRideIds] = useState([]);
  const [rejectedHydrated, setRejectedHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [selectedRide, setSelectedRide] = useState(null);
  const [bidsForRide, setBidsForRide] = useState([]);
  const [counterPrice, setCounterPrice] = useState('');
  const [goOfflineCountdown, setGoOfflineCountdown] = useState(null);
  const [popupRide, setPopupRide] = useState(null);
  /** `new` = ride just appeared on feed; `riderCounter` = rider sent a counter on an existing request */
  const [popupVariant, setPopupVariant] = useState('new');
  /** Set when `popupVariant === 'riderCounter'` — rider all-in and driver trip share */
  const [riderCounterPopupMeta, setRiderCounterPopupMeta] = useState(null);
  const [popupFoodOrder, setPopupFoodOrder] = useState(null);
  const [activeFoodOrder, setActiveFoodOrder] = useState(null);
  /** permission-denied | failed-precondition (index) | other */
  const [biddingFeedError, setBiddingFeedError] = useState(null);
  const [todaySnapshot, setTodaySnapshot] = useState({ takeHome: 0, rideCount: 0 });
  const [pendingBidRideIds, setPendingBidRideIds] = useState([]);
  const [driverActivityBanner, setDriverActivityBanner] = useState(null);
  /** `{ targets }` when choosing among multiple route stops (Android Alert button limit). */
  const [routeStopsNavPicker, setRouteStopsNavPicker] = useState(null);
  /** Rider can hide the horizontal request cards; new open requests auto-expand the section. */
  const [rideRequestsCollapsed, setRideRequestsCollapsed] = useState(false);
  const prevRideCountForPanelRef = useRef(0);
  const [riderPhotoTick, setRiderPhotoTick] = useState(0);
  const [popupRiderPhotoUri, setPopupRiderPhotoUri] = useState(null);
  const seenRiderCounterBidIdsRef = useRef(new Set());
  /** Per-ride: first `subscribeToBids` snapshot only seeds `seenRiderCounterBidIdsRef` (no banner). */
  const bidRiderCounterSeededRef = useRef(new Set());
  const hadActiveRideRef = useRef(false);
  const activityBannerTimerRef = useRef(null);
  const riderPhotoCacheRef = useRef({});
  const lastActivityRef = useRef(Date.now());
  const goOfflineTimerRef = useRef(null);
  const autoOfflineRef = useRef(null);
  const prevRideIdsRef = useRef(null);
  const skippedPopupIdsRef = useRef(new Set());
  const respondModalScrollRef = useRef(null);
  const scrollRespondModalToInput = useCallback(() => {
    if (Platform.OS === 'web') return;
    requestAnimationFrame(() => {
      try {
        respondModalScrollRef.current?.scrollToEnd?.({ animated: true });
      } catch (_) {
        /* scroll ref may be a native handle */
      }
    });
  }, []);
  const popupRideRef = useRef(null);
  const popupBackdropOpacity = useRef(new Animated.Value(0)).current;
  const popupSheetTranslate = useRef(new Animated.Value(40)).current;
  const popupSheetOpacity = useRef(new Animated.Value(0)).current;
  const selectedRideRef = useRef(null);
  const ridesRef = useRef([]);
  /** Live GPS for the “you” car marker (replaces a hardcoded Kingston point). */
  const [driverGps, setDriverGps] = useState(null);
  const lastDriverGpsRef = useRef(null);
  const didAutoCenterOnGpsRef = useRef(false);
  const driverWatchSubRef = useRef(null);
  const [biddingRidesAll, setBiddingRidesAll] = useState([]);
  const rides = useMemo(
    () => filterBiddingRidesForDriverFeed(biddingRidesAll, driverGps, {}),
    [biddingRidesAll, driverGps],
  );

  useEffect(() => {
    popupRideRef.current = popupRide;
  }, [popupRide]);
  useEffect(() => {
    selectedRideRef.current = selectedRide;
  }, [selectedRide]);
  useEffect(() => {
    ridesRef.current = rides;
  }, [rides]);

  useEffect(() => {
    const n = rides.length;
    if (n > prevRideCountForPanelRef.current) {
      setRideRequestsCollapsed(false);
    }
    prevRideCountForPanelRef.current = n;
  }, [rides.length]);

  useFocusEffect(
    useCallback(() => {
      if (!isFirebaseReady || !driverUid) return;
      let alive = true;
      getDriverEarnings(driverUid, 'day')
        .then((d) => {
          if (alive) setTodaySnapshot({ takeHome: d.takeHome ?? 0, rideCount: d.rideCount ?? 0 });
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [driverUid]),
  );

  const openPickupMaps = useCallback((rideLike) => {
    const c = getRidePickupCoords(rideLike);
    const label = rideLike?.pickup || t('driverDashboard.routePickupFallback');
    if (c) {
      Alert.alert(t('driverDashboard.navOpenTitle'), t('driverDashboard.navChooseApp', { label }), [
        { text: t('driverDashboard.cancel'), style: 'cancel' },
        ...directionsAlertActions(c.lat, c.lng, label),
      ]);
    } else Alert.alert(t('driverDashboard.directionsTitle'), t('driverDashboard.directionsFailPickup'));
  }, [t]);

  const openDropoffMaps = useCallback((rideLike) => {
    const c = getRideDropoffCoords(rideLike);
    const label = rideLike?.dropoff || t('driverDashboard.routeDestFallback');
    if (c) {
      Alert.alert(t('driverDashboard.navOpenTitle'), t('driverDashboard.navChooseApp', { label }), [
        { text: t('driverDashboard.cancel'), style: 'cancel' },
        ...directionsAlertActions(c.lat, c.lng, label),
      ]);
    } else Alert.alert(t('driverDashboard.directionsTitle'), t('driverDashboard.directionsFailDropoff'));
  }, [t]);

  const openFoodStopMaps = useCallback((rideLike) => {
    const c = getFoodStopNavLatLngForRide(rideLike);
    const label =
      (rideLike?.foodStop?.vendorName && String(rideLike.foodStop.vendorName).trim()) ||
      t('driverDashboard.foodPickupNavFallback');
    if (c) {
      Alert.alert(t('driverDashboard.navOpenTitle'), t('driverDashboard.navChooseApp', { label }), [
        { text: t('driverDashboard.cancel'), style: 'cancel' },
        ...directionsAlertActions(c.lat, c.lng, label),
      ]);
    } else Alert.alert(t('driverDashboard.directionsTitle'), t('driverDashboard.directionsFailFood'));
  }, [t]);

  const openRouteStopsMaps = useCallback((rideLike) => {
    const targets = getRideExtraStopNavTargets(rideLike);
    if (targets.length === 0) {
      Alert.alert(t('driverDashboard.routeStopsTitle'), t('driverDashboard.routeStopsNoLocations'));
      return;
    }
    if (targets.length === 1) {
      const tgt = targets[0];
      Alert.alert(t('driverDashboard.navOpenTitle'), t('driverDashboard.navChooseApp', { label: tgt.label }), [
        { text: t('driverDashboard.cancel'), style: 'cancel' },
        ...directionsAlertActions(tgt.lat, tgt.lng, tgt.label),
      ]);
      return;
    }
    setRouteStopsNavPicker({ targets });
  }, [t]);

  useEffect(() => {
    AsyncStorage.getItem(DRIVER_REJECTED_RIDES_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setRejectedRideIds(arr);
        } catch (e) {
          /* ignore */
        }
      })
      .finally(() => setRejectedHydrated(true));
  }, []);

  const addPendingBidRide = useCallback((rideId) => {
    if (!rideId) return;
    setPendingBidRideIds((prev) => {
      if (prev.includes(rideId)) return prev;
      const next = [...prev, rideId];
      AsyncStorage.setItem(DRIVER_PENDING_BID_RIDES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removePendingBidRide = useCallback((rideId) => {
    if (!rideId) return;
    setPendingBidRideIds((prev) => {
      const next = prev.filter((id) => id !== rideId);
      if (next.length !== prev.length) {
        AsyncStorage.setItem(DRIVER_PENDING_BID_RIDES_KEY, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DRIVER_PENDING_BID_RIDES_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setPendingBidRideIds(arr.filter(Boolean));
        } catch (_) {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const openIds = new Set(biddingRidesAll.map((r) => r.id));
    setPendingBidRideIds((prev) => {
      const next = prev.filter((id) => openIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [biddingRidesAll]);

  useEffect(() => {
    if (!isFirebaseReady || !rejectedHydrated) return;
    const hidden = new Set(rejectedRideIds);
    const unsub = subscribeToBiddingRides(
      (firebaseRides) => {
        setBiddingRidesAll(
          firebaseRides
            .filter((r) => !hidden.has(r.id))
            .filter((r) => isBiddingRideWithinAge(r, BIDDING_RIDE_MAX_AGE_MS))
            .map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              riderName: r.riderName || t('driverDashboard.riderFallback'),
              pickup: r.pickup,
              dropoff: r.dropoff,
              stops: r.stops || [],
              stopsFee: r.stopsFee || 0,
              bidPrice: r.bidPrice,
              foodStop: r.foodStop,
              riderId: r.riderId,
              useRedeem: !!r.useRedeem,
              splitCount: typeof r.splitCount === 'number' && r.splitCount > 1 ? r.splitCount : 1,
              pickupLatitude: r.pickupLatitude,
              pickupLongitude: r.pickupLongitude,
              pickupLat: r.pickupLat,
              pickupLng: r.pickupLng,
              pickupLocation: r.pickupLocation,
              pickupCoords: r.pickupCoords,
            }))
        );
      },
      (err) => {
        if (!err) {
          setBiddingFeedError(null);
          return;
        }
        const code = err?.code || '';
        if (code === 'permission-denied') setBiddingFeedError('permission');
        else if (code === 'failed-precondition') setBiddingFeedError('index');
        else setBiddingFeedError('other');
      },
      (cancelled) => {
        const id = cancelled?.id;
        if (!id) return;
        removePendingBidRide(id);
        if (popupRideRef.current?.id === id) {
          setPopupRide(null);
          setPopupVariant('new');
          setRiderCounterPopupMeta(null);
        }
        if (selectedRideRef.current?.id === id) {
          setSelectedRide(null);
          setCounterPrice('');
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        const name = cancelled.riderName || t('driverDashboard.riderFallback');
        const by = String(cancelled.cancelledBy || '').toLowerCase();
        const lead =
          by === 'rider'
            ? t('driverDashboard.rideCancelByRider', { name })
            : t('driverDashboard.rideCancelGeneric', { name });
        const reason = cancelled.cancellationReason
          ? t('driverDashboard.rideReasonPrefix', { reason: cancelled.cancellationReason })
          : '';
        Alert.alert(t('driverDashboard.rideCancelTitle'), `${lead}${reason}`);
      },
      (left) => {
        const id = left?.id;
        if (!id) return;
        removePendingBidRide(id);
        if (popupRideRef.current?.id === id) {
          setPopupRide(null);
          setPopupVariant('new');
          setRiderCounterPopupMeta(null);
        }
        if (selectedRideRef.current?.id === id) {
          setSelectedRide(null);
          setCounterPrice('');
        }
        setDriverActivityBanner((b) => {
          if (b?.kind === 'riderCounter' && b.rideId === id) {
            if (activityBannerTimerRef.current) {
              clearTimeout(activityBannerTimerRef.current);
              activityBannerTimerRef.current = null;
            }
            return null;
          }
          return b;
        });
      },
    );
    return unsub;
  }, [rejectedRideIds, rejectedHydrated, removePendingBidRide, t]);

  useLayoutEffect(() => {
    const n = rides.length;
    tabNavigation.setOptions({
      tabBarBadge: isOnline && n > 0 ? (n > 99 ? '99+' : n) : undefined,
    });
  }, [tabNavigation, rides.length, isOnline]);

  useEffect(() => {
    if (!isOnline) {
      closeDriverRequestPopup();
      return;
    }
    const ids = rides.map((r) => r.id);
    if (prevRideIdsRef.current === null) {
      prevRideIdsRef.current = new Set(ids);
      return;
    }
    const prev = prevRideIdsRef.current;
    const newlyAdded = rides.filter(
      (r) =>
        !prev.has(r.id) &&
        !skippedPopupIdsRef.current.has(r.id) &&
        isBiddingRideWithinAge(r, BIDDING_POPUP_MAX_AGE_MS),
    );
    prevRideIdsRef.current = new Set(ids);
    if (newlyAdded.length > 0 && !selectedRideRef.current) {
      playRideRequestSound().catch(() => {});
      setRiderCounterPopupMeta(null);
      setPopupVariant('new');
      setPopupRide(newlyAdded[0]);
      newlyAdded.forEach((r) => {
        if ((r.splitCount || 1) > 1) {
          notifyDriverSplitFareLocal({
            riderName: r.riderName,
            splitCount: r.splitCount,
            bidPrice: r.bidPrice,
          }).catch(() => {});
        }
      });
    }
  }, [rides, isOnline, closeDriverRequestPopup]);

  useEffect(() => {
    if (!isFirebaseReady || !driverUid) return;
    const unsub = subscribeToDriverActiveRide(driverUid, setActiveRide);
    return unsub;
  }, [driverUid]);

  useEffect(() => {
    const id = popupRide?.foodStop?.foodOrderId;
    if (!id || !isFirebaseReady) {
      setPopupFoodOrder(null);
      return;
    }
    const unsub = subscribeToFoodOrder(id, setPopupFoodOrder);
    return unsub;
  }, [popupRide?.foodStop?.foodOrderId]);

  useEffect(() => {
    const id = activeRide?.foodStop?.foodOrderId;
    if (!id || !isFirebaseReady) {
      setActiveFoodOrder(null);
      return;
    }
    const unsub = subscribeToFoodOrder(id, setActiveFoodOrder);
    return unsub;
  }, [activeRide?.foodStop?.foodOrderId]);

  useEffect(() => {
    if (fleetAccessBlocked) {
      setIsOnline(false);
    }
  }, [fleetAccessBlocked]);

  useEffect(() => {
    if (!isFirebaseReady || !driverUid) return;
    const online = fleetAccessBlocked ? false : isOnline;
    updateDriverOnlineStatus(driverUid, online).catch(() => {});
  }, [isOnline, driverUid, fleetAccessBlocked]);

  // Car marker: live GPS — watchPosition updates the car + lastDriverGpsRef.
  useEffect(() => {
    didAutoCenterOnGpsRef.current = false;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distance: 5,
        },
        (location) => {
          if (cancelled) return;
          const h = location.coords.heading;
          const payload = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            ...(location.mocked === true ? { mocked: true } : {}),
            ...(typeof h === 'number' && !Number.isNaN(h) && h >= 0 ? { heading: h } : {}),
          };
          lastDriverGpsRef.current = payload;
          setDriverGps(payload);
        }
      );
      if (cancelled) {
        try {
          subscription.remove();
        } catch (_) {
          /* ignore */
        }
        return;
      }
      driverWatchSubRef.current = subscription;
    })();
    return () => {
      cancelled = true;
      try {
        driverWatchSubRef.current?.remove();
        driverWatchSubRef.current = null;
      } catch (_) {
        /* ignore */
      }
    };
  }, []);

  // Publish driver location to RTDB while online (rider map / nearby) — reuses the same fix as the car marker.
  useEffect(() => {
    if (!isFirebaseReady || !driverUid || !isOnline || fleetAccessBlocked) return;
    let cancelled = false;
    let intervalId = null;
    const publish = async () => {
      try {
        const p = lastDriverGpsRef.current;
        if (p) {
          if (!cancelled) updateDriverLocation(driverUid, p).catch(() => {});
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const h = pos.coords.heading;
        updateDriverLocation(driverUid, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          ...(pos.mocked === true ? { mocked: true } : {}),
          ...(typeof h === 'number' && !Number.isNaN(h) ? { heading: h } : {}),
        });
      } catch {
        /* ignore */
      }
    };
    publish();
    intervalId = setInterval(publish, 30000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOnline, driverUid, fleetAccessBlocked, isFirebaseReady]);

  /** Rider cancelled after accept — clear dashboard tile immediately (active-ride screen shows alert + reset). */
  useEffect(() => {
    const id = activeRide?.id;
    if (!id || !isFirebaseReady) return undefined;
    return subscribeToRide(id, (r) => {
      if (r?.status !== 'cancelled') return;
      const by = String(r.cancelledBy || '').toLowerCase();
      if (by === 'driver') return;
      setActiveRide(null);
    });
  }, [activeRide?.id, isFirebaseReady]);

  // Reset activity on new rides or accepting bid
  useEffect(() => {
    if (rides.length > 0) lastActivityRef.current = Date.now();
  }, [rides.length]);

  // Auto-offline after 15 min of no activity (ghost driver prevention) - skip if active ride
  useEffect(() => {
    if (!isOnline || activeRide) return;
    autoOfflineRef.current = setInterval(() => {
      const idle = (Date.now() - lastActivityRef.current) / 1000 / 60;
      if (idle >= 15) {
        setIsOnline(false);
        lastActivityRef.current = Date.now();
      }
    }, 60000);
    return () => clearInterval(autoOfflineRef.current);
  }, [isOnline, activeRide]);

  const handleOnlineChange = (value) => {
    if (value && fleetAccessBlocked) {
      const st = userProfile?.driverAccountStatus;
      const msg =
        st === 'rejected'
          ? t('driverDashboard.approvalRejectedBody')
          : t('driverDashboard.approvalPendingBody');
      Alert.alert(t('driverDashboard.approvalRequiredTitle'), msg);
      return;
    }
    if (value) {
      lastActivityRef.current = Date.now();
      setIsOnline(true);
      setGoOfflineCountdown(null);
      if (goOfflineTimerRef.current) clearInterval(goOfflineTimerRef.current);
      return;
    }
    setGoOfflineCountdown(5);
  };

  useEffect(() => {
    if (goOfflineCountdown === null || goOfflineCountdown <= 0) return;
    goOfflineTimerRef.current = setInterval(() => {
      setGoOfflineCountdown((c) => {
        if (c <= 1) {
          if (goOfflineTimerRef.current) clearInterval(goOfflineTimerRef.current);
          setIsOnline(false);
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (goOfflineTimerRef.current) clearInterval(goOfflineTimerRef.current); };
  }, [goOfflineCountdown]);

  const cancelGoOffline = () => {
    setGoOfflineCountdown(null);
    if (goOfflineTimerRef.current) clearInterval(goOfflineTimerRef.current);
  };

  useEffect(() => {
    if (!selectedRide?.id) return;
    const unsub = subscribeToBids(selectedRide.id, setBidsForRide);
    return unsub;
  }, [selectedRide?.id]);

  useEffect(() => {
    if (userProfile?.role !== 'driver') return;
    AsyncStorage.getItem(SUBSCRIPTION_INFO_KEY).then((seen) => {
      if (!seen) setShowSubscriptionModal(true);
    });
  }, [userProfile?.role]);

  const dismissDriverActivityBanner = useCallback(() => {
    if (activityBannerTimerRef.current) {
      clearTimeout(activityBannerTimerRef.current);
      activityBannerTimerRef.current = null;
    }
    setDriverActivityBanner(null);
  }, []);

  const closeDriverRequestPopup = useCallback(() => {
    setPopupRide(null);
    setPopupVariant('new');
    setRiderCounterPopupMeta(null);
  }, []);

  const driverBannerBootRef = useRef(true);
  const driverMapRef = useRef(null);

  /** Google Maps on Android often ignores `initialRegion`; snap camera after native map is ready. Prefer live GPS if we already have a fix. */
  const onDriverMapReady = useCallback(() => {
    const live = lastDriverGpsRef.current;
    const r = live
      ? {
          latitude: live.latitude,
          longitude: live.longitude,
          latitudeDelta: DRIVER_MAP_REGION.latitudeDelta,
          longitudeDelta: DRIVER_MAP_REGION.longitudeDelta,
        }
      : {
          latitude: DRIVER_MAP_REGION.latitude,
          longitude: DRIVER_MAP_REGION.longitude,
          latitudeDelta: DRIVER_MAP_REGION.latitudeDelta,
          longitudeDelta: DRIVER_MAP_REGION.longitudeDelta,
        };
    const apply = () => {
      driverMapRef.current?.animateToRegion(r, 0);
      if (live) didAutoCenterOnGpsRef.current = true;
    };
    requestAnimationFrame(apply);
    if (Platform.OS === 'android') {
      setTimeout(apply, 300);
    }
  }, []);

  /** When GPS arrives after the map is ready, center on the driver (onMapReady already handles GPS-first). */
  useEffect(() => {
    if (!driverGps || !driverMapRef.current || didAutoCenterOnGpsRef.current) return;
    didAutoCenterOnGpsRef.current = true;
    driverMapRef.current.animateToRegion(
      {
        latitude: driverGps.latitude,
        longitude: driverGps.longitude,
        latitudeDelta: DRIVER_MAP_REGION.latitudeDelta,
        longitudeDelta: DRIVER_MAP_REGION.longitudeDelta,
      },
      450
    );
  }, [driverGps]);

  useEffect(() => {
    if (activeRide?.id) {
      removePendingBidRide(activeRide.id);
    }
    if (driverBannerBootRef.current) {
      driverBannerBootRef.current = false;
      hadActiveRideRef.current = !!activeRide;
      return;
    }
    const hadActive = hadActiveRideRef.current;
    if (!hadActive && activeRide) {
      playBidAcceptedSound().catch(() => {});
      const name = activeRide.riderName || t('driverDashboard.riderFallback');
      const rid = activeRide.riderId != null ? String(activeRide.riderId) : null;
      if (activityBannerTimerRef.current) clearTimeout(activityBannerTimerRef.current);
      const cached = rid ? riderPhotoCacheRef.current[rid] : null;
      setDriverActivityBanner({
        kind: 'accepted',
        bidDocId: null,
        title: t('driverDashboard.acceptedBannerTitle', { name }),
        subtitle: t('driverDashboard.acceptedBannerSub'),
        imageUri: cached?.uri || null,
        riderId: rid,
      });
      if (rid) {
        getUserProfile(rid)
          .then((p) => {
            const u = p?.photoURL || p?.photoUrl || null;
            riderPhotoCacheRef.current[rid] = { loaded: true, uri: u };
            setRiderPhotoTick((t) => t + 1);
            setDriverActivityBanner((prev) =>
              prev?.kind === 'accepted' ? { ...prev, imageUri: u } : prev,
            );
          })
          .catch(() => {});
      }
      activityBannerTimerRef.current = setTimeout(() => setDriverActivityBanner(null), 12000);
    }
    hadActiveRideRef.current = !!activeRide;
  }, [activeRide, removePendingBidRide, t]);

  const biddingWatchIdsKey = useMemo(() => {
    const merged = [...new Set([...rides.map((r) => r.id), ...pendingBidRideIds])].filter(Boolean);
    merged.sort();
    return merged.join(',');
  }, [rides, pendingBidRideIds]);

  const watchRideIdsArray = useMemo(
    () => (biddingWatchIdsKey ? biddingWatchIdsKey.split(',').filter(Boolean) : []),
    [biddingWatchIdsKey],
  );

  const latestRiderCounterForModal = useMemo(() => {
    const uid = String(driverUid || '');
    const list = (bidsForRide || []).filter(
      (b) => b.riderCounter && String(b.driverId || '') === uid,
    );
    if (!list.length) return null;
    return [...list].sort((a, b) => bidDocCreatedMs(b) - bidDocCreatedMs(a))[0];
  }, [bidsForRide, driverUid]);

  useEffect(() => {
    if (!isFirebaseReady || !driverUid || !biddingWatchIdsKey) return undefined;
    const rideIds = biddingWatchIdsKey.split(',').filter(Boolean);
    const rideIdsSet = new Set(rideIds);
    for (const id of [...bidRiderCounterSeededRef.current]) {
      if (!rideIdsSet.has(id)) bidRiderCounterSeededRef.current.delete(id);
    }
    if (rideIds.length === 0) return undefined;
    const unsubs = rideIds.map((rideId) =>
      subscribeToBids(rideId, (bids) => {
        const firstSnap = !bidRiderCounterSeededRef.current.has(rideId);
        if (firstSnap) {
          // Firestore can deliver an empty snapshot first; don't seed yet or we'd show stale counters as "new".
          if (!bids.length) return;
          for (const b of bids) {
            if (!b.riderCounter) continue;
            if (String(b.driverId || '') !== String(driverUid)) continue;
            seenRiderCounterBidIdsRef.current.add(b.id);
          }
          bidRiderCounterSeededRef.current.add(rideId);
          return;
        }
        for (const b of bids) {
          if (!b.riderCounter) continue;
          if (String(b.driverId || '') !== String(driverUid)) continue;
          if (seenRiderCounterBidIdsRef.current.has(b.id)) continue;
          seenRiderCounterBidIdsRef.current.add(b.id);
          const rawPrice = b.price ?? b.counterPrice;
          const priceNum = Number(rawPrice);
          const rideSnap = ridesRef.current.find((r) => r.id === rideId);
          const driverEarns =
            rideSnap && Number.isFinite(priceNum) ? driverEarnsFromRiderAllIn(rideSnap, priceNum) : null;
          const driverTrip = driverEarns != null && Number.isFinite(driverEarns) ? driverEarns : rawPrice;
          const suggestedDriverEarns = driverEarns;
          const rid = b.riderId != null ? String(b.riderId) : null;
          const bidDocId = b.id;
          const rideForPopup = ridesRef.current.find((r) => r.id === rideId);
          const ra = Number.isFinite(priceNum) ? priceNum : 0;
          const de =
            driverEarns != null && Number.isFinite(driverEarns)
              ? driverEarns
              : Number.isFinite(Number(driverTrip))
                ? Number(driverTrip)
                : 0;
          setRiderCounterPopupMeta({ riderAllIn: ra, driverEarns: de });

          const requestSheetOpenForRide = popupRideRef.current?.id === rideId;
          const respondModalOpenForRide = selectedRideRef.current?.id === rideId;

          const prefetchRiderPhotoForPopup = () => {
            if (!rid) return;
            getUserProfile(rid)
              .then((p) => {
                const u = p?.photoURL || p?.photoUrl || null;
                riderPhotoCacheRef.current[rid] = { loaded: true, uri: u };
                setRiderPhotoTick((t) => t + 1);
              })
              .catch(() => {});
          };

          if (requestSheetOpenForRide) {
            setPopupVariant('riderCounter');
            prefetchRiderPhotoForPopup();
            void playBidAcceptedSound();
            continue;
          }

          if (respondModalOpenForRide) {
            prefetchRiderPhotoForPopup();
            void playBidAcceptedSound();
            continue;
          }

          if (rideForPopup) {
            if (activityBannerTimerRef.current) {
              clearTimeout(activityBannerTimerRef.current);
              activityBannerTimerRef.current = null;
            }
            setDriverActivityBanner(null);
            setPopupRide(rideForPopup);
            setPopupVariant('riderCounter');
            prefetchRiderPhotoForPopup();
            void playBidAcceptedSound();
            continue;
          }

          if (activityBannerTimerRef.current) clearTimeout(activityBannerTimerRef.current);
          const cached = rid ? riderPhotoCacheRef.current[rid] : null;
          setDriverActivityBanner({
            kind: 'riderCounter',
            rideId,
            bidDocId,
            suggestedDriverEarns:
              typeof suggestedDriverEarns === 'number' && Number.isFinite(suggestedDriverEarns)
                ? suggestedDriverEarns
                : null,
            title: t('driverDashboard.riderCounterBannerTitle', {
              amount: formatJmdPrimary(driverTrip),
            }),
            subtitle: t('driverDashboard.riderCounterBannerSub'),
            imageUri: cached?.uri || null,
            riderId: rid,
          });
          if (rid) {
            getUserProfile(rid)
              .then((p) => {
                const u = p?.photoURL || p?.photoUrl || null;
                riderPhotoCacheRef.current[rid] = { loaded: true, uri: u };
                setRiderPhotoTick((t) => t + 1);
                setDriverActivityBanner((prev) =>
                  prev?.bidDocId === bidDocId ? { ...prev, imageUri: u } : prev,
                );
              })
              .catch(() => {});
          }
          activityBannerTimerRef.current = setTimeout(() => setDriverActivityBanner(null), 9000);
          void playBidAcceptedSound();
        }
      }),
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [biddingWatchIdsKey, driverUid, isFirebaseReady, t, formatJmdPrimary]);

  useEffect(() => {
    if (!popupRide) {
      popupBackdropOpacity.setValue(0);
      popupSheetOpacity.setValue(0);
      popupSheetTranslate.setValue(36);
      return;
    }
    popupBackdropOpacity.setValue(0);
    popupSheetOpacity.setValue(0);
    popupSheetTranslate.setValue(40);
    Animated.parallel([
      Animated.timing(popupBackdropOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(popupSheetOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(popupSheetTranslate, {
        toValue: 0,
        friction: 8,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
  }, [popupRide?.id, popupVariant, popupBackdropOpacity, popupSheetOpacity, popupSheetTranslate]);

  useEffect(() => {
    if (!isFirebaseReady || !biddingWatchIdsKey) return undefined;
    const rideIds = biddingWatchIdsKey.split(',').filter(Boolean);
    if (rideIds.length === 0) return undefined;
    const targets = rides.filter((r) => r.riderId && rideIds.includes(r.id));
    if (targets.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      await Promise.all(
        targets.map(async (r) => {
          const rid = String(r.riderId);
          if (riderPhotoCacheRef.current[rid]?.loaded) return;
          try {
            const p = await getUserProfile(rid);
            if (cancelled) return;
            riderPhotoCacheRef.current[rid] = {
              loaded: true,
              uri: p?.photoURL || p?.photoUrl || null,
            };
          } catch {
            if (!cancelled) riderPhotoCacheRef.current[rid] = { loaded: true };
          }
        }),
      );
      if (!cancelled) setRiderPhotoTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [rides, pendingBidRideIds, isFirebaseReady]);

  useEffect(() => {
    const id = popupRide?.id;
    const rid = popupRide?.riderId != null ? String(popupRide.riderId) : null;
    if (!id || !rid || !pendingBidRideIds.includes(id)) {
      setPopupRiderPhotoUri(null);
      return undefined;
    }
    const cached = riderPhotoCacheRef.current[rid];
    if (cached?.uri) setPopupRiderPhotoUri(cached.uri);
    let alive = true;
    getUserProfile(rid)
      .then((p) => {
        if (!alive) return;
        const u = p?.photoURL || p?.photoUrl || null;
        riderPhotoCacheRef.current[rid] = { loaded: true, uri: u };
        setPopupRiderPhotoUri(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [popupRide?.id, popupRide?.riderId, pendingBidRideIds, rides]);

  useEffect(
    () => () => {
      if (activityBannerTimerRef.current) clearTimeout(activityBannerTimerRef.current);
    },
    [],
  );

  const dismissSubscriptionModal = () => {
    setShowSubscriptionModal(false);
    AsyncStorage.setItem(SUBSCRIPTION_INFO_KEY, 'yes');
  };

  const closeRespondModal = () => {
    setSelectedRide(null);
    setCounterPrice('');
  };

  const openRespondModal = useCallback((ride, opts) => {
    if (!ride) return;
    lastActivityRef.current = Date.now();
    setShowSubscriptionModal(false);
    setPopupRide(null);
    setPopupVariant('new');
    setRiderCounterPopupMeta(null);
    setSelectedRide(ride);
    const suggested = opts?.suggestedDriverEarns;
    const base =
      typeof suggested === 'number' && Number.isFinite(suggested) && suggested > 0
        ? suggested
        : getDriverEarnsFromRide(ride);
    setCounterPrice(String(Math.round(base + 100)));
  }, []);

  const focusRideIdFromPush = route.params?.focusRideIdFromPush;

  useEffect(() => {
    const id = focusRideIdFromPush != null ? String(focusRideIdFromPush) : '';
    if (!id || !rides?.length) return;
    const r = rides.find((x) => x.id === id);
    if (!r) return;
    try {
      tabNavigation.setParams({ focusRideIdFromPush: undefined });
    } catch (_) {}
    openRespondModal(r);
  }, [focusRideIdFromPush, rides, tabNavigation, openRespondModal]);

  const handleModalReject = () => {
    const r = selectedRide;
    if (!r) return;
    closeRespondModal();
    handleBid(r, 'reject');
  };

  const handleModalAccept = () => {
    const r = selectedRide;
    if (!r) return;
    closeRespondModal();
    handleBid(r, 'accept');
  };

  const handleBid = async (ride, action) => {
    if (action === 'accept') {
      if (!isFirebaseReady || !db) {
        Alert.alert(t('driverDashboard.connectTitle'), t('driverDashboard.connectSubDetail'));
        return;
      }
      const uid = getCurrentAuthUid(user) || userProfile?.id;
      if (!uid) {
        Alert.alert(t('driverDashboard.notSignedTitle'), t('driverDashboard.notSignedBody'));
        return;
      }
      const isDriver =
        userProfile?.role === 'driver' ||
        (Array.isArray(userProfile?.roles) && userProfile.roles.includes('driver'));
      if (!isDriver) {
        Alert.alert(t('driverDashboard.driverRoleTitle'), t('driverDashboard.driverRoleBody'));
        return;
      }
      try {
        lastActivityRef.current = Date.now();
        await addBid(ride.id, {
          driverId: String(uid),
          driverName: userProfile?.name || t('driverDashboard.driverFallback'),
          price: ride.bidPrice,
          counterPrice: ride.bidPrice,
          rating: userProfile?.rating || 4.8,
        });
        const pickupNav = getRidePickupCoords(ride);
        const body = t('driverDashboard.offerSentBody', {
          name: ride.riderName || t('driverDashboard.riderFallback'),
        });
        if (pickupNav && Number.isFinite(pickupNav.lat) && Number.isFinite(pickupNav.lng)) {
          Alert.alert(t('driverDashboard.offerSentTitle'), `${body}\n\n${t('driverDashboard.offerPickupDirections')}`, [
            { text: t('driverDashboard.notNow'), style: 'cancel' },
            ...directionsAlertActions(
              pickupNav.lat,
              pickupNav.lng,
              ride.pickup || t('driverDashboard.routePickupFallback'),
            ),
          ]);
        } else {
          Alert.alert(t('driverDashboard.offerSentTitle'), body);
        }
        addPendingBidRide(ride.id);
      } catch (e) {
        const code = e?.code || '';
        const msg =
          code === 'permission-denied'
            ? t('driverDashboard.permDeniedBid')
            : e.message || t('driverDashboard.couldNotSendBid');
        Alert.alert(t('driverDashboard.errorTitle'), msg);
      }
    } else if (action === 'counter') {
      openRespondModal(ride);
    } else if (action === 'reject') {
      if (isFirebaseReady && db && ride?.id) {
        const uid = getCurrentAuthUid(user) || userProfile?.id;
        if (uid) {
          recordDriverDeclinedOffer(ride.id, uid).catch(() => {});
        }
      }
      removePendingBidRide(ride.id);
      setRejectedRideIds((prev) => {
        if (prev.includes(ride.id)) return prev;
        const next = [...prev, ride.id];
        AsyncStorage.setItem(DRIVER_REJECTED_RIDES_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      if (popupRideRef.current?.id === ride.id) {
        setPopupRide(null);
        setPopupVariant('new');
        setRiderCounterPopupMeta(null);
      } else {
        setPopupRide((p) => (p?.id === ride.id ? null : p));
      }
    }
  };

  const handleSendCounter = async () => {
    const driverTrip = parseInt(counterPrice, 10);
    if (!selectedRide || isNaN(driverTrip) || driverTrip < MIN_FARE_JMD) {
      Alert.alert(
        t('driverDashboard.invalidTitle'),
        t('driverDashboard.invalidMinCounter', { min: formatJmdPrimary(MIN_FARE_JMD) }),
      );
      return;
    }
    const riderAllIn = riderAllInFromDriverEarns(selectedRide, driverTrip);
    if (!isFirebaseReady || !db) {
      Alert.alert(t('driverDashboard.connectTitle'), t('driverDashboard.connectSub'));
      return;
    }
    const uid = getCurrentAuthUid(user) || userProfile?.id;
    if (!uid) {
      Alert.alert(t('driverDashboard.notSignedTitle'), t('driverDashboard.notSignedBody'));
      return;
    }
    try {
      lastActivityRef.current = Date.now();
      await addBid(selectedRide.id, {
        driverId: String(uid),
        driverName: userProfile?.name || t('driverDashboard.driverFallback'),
        price: riderAllIn,
        counterPrice: riderAllIn,
        rating: userProfile?.rating || 4.8,
      });
      Alert.alert(
        t('driverDashboard.counterSentTitle'),
        t('driverDashboard.counterSentBody', {
          amount: formatJmdPrimary(driverTrip),
          name: selectedRide.riderName || t('driverDashboard.riderFallback'),
        }),
      );
      addPendingBidRide(selectedRide.id);
      closeRespondModal();
    } catch (e) {
      const code = e?.code || '';
      const msg =
        code === 'permission-denied'
          ? t('driverDashboard.permDeniedCounter')
          : e.message || t('driverDashboard.couldNotSendCounter');
      Alert.alert(t('driverDashboard.errorTitle'), msg);
    }
  };

  const handleMarkPickedUp = async (ride) => {
    const foodOrderId = ride.foodStop?.foodOrderId;
    if (!foodOrderId) {
      Alert.alert(t('driverDashboard.errorTitle'), t('driverDashboard.foodDemoBody'));
      return;
    }
    try {
      await updateFoodOrderStatus(foodOrderId, 'picked-up');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
      Alert.alert(t('driverDashboard.foodPickedTitle'), t('driverDashboard.foodPickedBody'));
    } catch (e) {
      Alert.alert(t('driverDashboard.errorTitle'), e.message || t('driverDashboard.demoFoodError'));
    }
  };

  const styles = createStyles(theme);
  const popupDriverEarnsDisplay = useMemo(() => {
    if (!popupRide) return 0;
    if (
      popupVariant === 'riderCounter' &&
      riderCounterPopupMeta &&
      Number.isFinite(riderCounterPopupMeta.driverEarns)
    ) {
      return Math.max(0, Math.round(riderCounterPopupMeta.driverEarns));
    }
    return Math.round(getDriverEarnsFromRide(popupRide));
  }, [popupRide, popupVariant, riderCounterPopupMeta]);
  const respondModalListedDriverEarns = useMemo(
    () => (selectedRide ? Math.round(getDriverEarnsFromRide(selectedRide)) : 0),
    [selectedRide],
  );
  const respondModalDriverEarns = useMemo(() => {
    if (!selectedRide) return 0;
    if (latestRiderCounterForModal) {
      const raw = Number(
        latestRiderCounterForModal.price ?? latestRiderCounterForModal.counterPrice ?? 0,
      );
      return Math.round(driverEarnsFromRiderAllIn(selectedRide, raw));
    }
    return respondModalListedDriverEarns;
  }, [selectedRide, latestRiderCounterForModal, respondModalListedDriverEarns]);
  const activeRidePickupLegDone = activeRide ? !!activeRide.driverPickupArrivedAt : false;
  const foodStopNavCoord = activeRide ? getFoodStopNavLatLngForRide(activeRide) : null;
  const extraStopNavTargets = activeRide ? getRideExtraStopNavTargets(activeRide) : [];
  const activeRideNeedsFoodStopLeg = !!foodStopNavCoord;
  const activeRideFoodStopLegDone =
    !activeRideNeedsFoodStopLeg || !!activeRide?.foodStop?.bothAtStopConfirmedAt;
  const postPickupIntermediateUnlocked = activeRidePickupLegDone && activeRideFoodStopLegDone;
  const showActiveFoodNavBtn = activeRideNeedsFoodStopLeg;
  const showActiveRouteStopsNavBtn = extraStopNavTargets.length > 0;
  const showActiveSecondNavRow = showActiveFoodNavBtn || showActiveRouteStopsNavBtn;
  return (
    <View style={styles.container}>
      <MapView
        ref={driverMapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={DRIVER_MAP_REGION}
        onMapReady={onDriverMapReady}
        {...(Platform.OS === 'android' ? { loadingEnabled: true, googleRenderer: 'LEGACY' } : {})}
        showsTraffic
        showsUserLocation={false}
      >
        {driverGps ? (
          <MovingDriverMapMarker
            coordinate={{ latitude: driverGps.latitude, longitude: driverGps.longitude }}
            heading={typeof driverGps.heading === 'number' && !Number.isNaN(driverGps.heading) ? driverGps.heading : null}
            title={t('driverDashboard.mapYouTitle')}
            description={t('driverDashboard.mapYouDesc')}
            moveDurationMs={500}
            zIndex={80}
          />
        ) : null}
        {rides.slice(0, 3).map((b) => {
          const p = getRidePickupCoords(b);
          if (!p) return null;
          return (
            <RiderMapMarker
              key={b.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={b.riderName || t('driverDashboard.riderFallback')}
              description={t('driverDashboard.mapRideRequest')}
            />
          );
        })}
      </MapView>
      <View style={styles.overlay}>
        <View style={[styles.driverTopBannerWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          {fleetAccessBlocked ? (
            <View
              style={[
                styles.approvalBanner,
                { backgroundColor: theme.colors.error ?? '#DC2626', borderColor: 'rgba(255,255,255,0.2)' },
              ]}
            >
              <Ionicons name="hourglass-outline" size={22} color="#FFFFFF" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.approvalBannerTitle}>
                  {userProfile?.driverAccountStatus === 'rejected'
                    ? t('driverDashboard.approvalRejectedTitle')
                    : t('driverDashboard.approvalPendingTitle')}
                </Text>
                <Text style={styles.approvalBannerSub}>
                  {userProfile?.driverAccountStatus === 'rejected'
                    ? t('driverDashboard.approvalRejectedBody')
                    : t('driverDashboard.approvalPendingBody')}
                </Text>
              </View>
            </View>
          ) : null}
          {!fleetAccessBlocked && showTrialSyncBanner ? (
            <View
              style={[
                styles.approvalBanner,
                { backgroundColor: '#B45309', borderColor: 'rgba(255,255,255,0.2)', marginBottom: 8 },
              ]}
            >
              <Ionicons name="information-circle-outline" size={22} color="#FFFFFF" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.approvalBannerTitle}>{t('driverProfile.trialSyncPromptTitle')}</Text>
                <Text style={styles.approvalBannerSub}>{t('driverProfile.trialSyncBanner')}</Text>
              </View>
            </View>
          ) : null}
          {!fleetAccessBlocked && showTrialFinalWeekBanner ? (
            <View
              style={[
                styles.approvalBanner,
                { backgroundColor: '#6D28D9', borderColor: 'rgba(255,255,255,0.2)', marginBottom: 8 },
              ]}
            >
              <Ionicons name="timer-outline" size={22} color="#FFFFFF" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.approvalBannerTitle}>{t('driverProfile.trialFinalWeekTitle')}</Text>
                <Text style={styles.approvalBannerSub}>
                  {t('driverProfile.trialFinalWeekBanner', { days: trialDaysRemaining ?? '—' })}
                </Text>
              </View>
            </View>
          ) : null}
          <BiddingActivityBanner
            visible={!!driverActivityBanner}
            title={driverActivityBanner?.title}
            subtitle={driverActivityBanner?.subtitle}
            imageUri={driverActivityBanner?.imageUri}
            onDismiss={dismissDriverActivityBanner}
            onBannerPress={
              driverActivityBanner?.kind === 'riderCounter' && driverActivityBanner?.rideId
                ? () => {
                    const rId = driverActivityBanner.rideId;
                    const sug = driverActivityBanner.suggestedDriverEarns;
                    const r = ridesRef.current.find((x) => x.id === rId);
                    if (r) openRespondModal(r, { suggestedDriverEarns: sug });
                    dismissDriverActivityBanner();
                  }
                : undefined
            }
            theme={theme}
          />
        </View>
        <View style={[styles.onlineRow, driverActivityBanner ? { marginTop: 64 } : null]}>
          <Text style={[styles.onlineText, { color: isOnline ? theme.colors.primary : theme.colors.textSecondary }]}>
            {isOnline ? t('driverDashboard.statusOnline') : t('driverDashboard.statusOffline')}
          </Text>
          {goOfflineCountdown !== null ? (
            <View style={styles.goOfflineWrap}>
              <Text style={styles.goOfflineText}>
                {t('driverDashboard.goingOffline', { seconds: goOfflineCountdown })}
              </Text>
              <TouchableOpacity onPress={cancelGoOffline} style={styles.cancelOfflineBtn}>
                <Text style={styles.cancelOfflineText}>{t('driverDashboard.cancelGoOffline')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Switch
              value={fleetAccessBlocked ? false : isOnline}
              onValueChange={handleOnlineChange}
              disabled={fleetAccessBlocked}
              trackColor={{ true: theme.colors.primary }}
            />
          )}
        </View>
        <TouchableOpacity
          style={styles.todayStrip}
          onPress={() => tabNavigation.navigate('Earnings')}
          activeOpacity={0.88}
        >
          <Ionicons name="wallet-outline" size={22} color={theme.colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.todayStripLabel}>{t('driverDashboard.today24h')}</Text>
            <Text style={styles.todayStripValue}>
              {t('driverDashboard.todayValue', {
                takeHome: formatJmdPrimary(Math.round(todaySnapshot.takeHome || 0)),
                rideCount: String(todaySnapshot.rideCount ?? 0),
                ridesWord:
                  (todaySnapshot.rideCount ?? 0) === 1
                    ? t('driverDashboard.rideSingular')
                    : t('driverDashboard.ridePlural'),
              })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        {rideRequestsCollapsed && rides.length > 0 ? (
          <TouchableOpacity
            style={[
              styles.rideRequestsCollapsedBar,
              { borderColor: theme.colors.primary + '44', backgroundColor: theme.colors.surface },
            ]}
            onPress={() => setRideRequestsCollapsed(false)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={t('driverDashboard.expandRideRequestsA11y', { count: rides.length })}
          >
            <Ionicons name="car-sport" size={22} color={theme.colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.rideRequestsCollapsedTitle, { color: theme.colors.text }]}>
                {t('driverDashboard.rideRequests')}
              </Text>
              <Text style={[styles.rideRequestsCollapsedSub, { color: theme.colors.textSecondary }]}>
                {t('driverDashboard.openCount', { count: rides.length })} · {t('driverDashboard.tapToExpandRequests')}
              </Text>
            </View>
            <Ionicons name="chevron-up" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <>
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>{t('driverDashboard.rideRequests')}</Text>
          <View style={styles.sectionHeaderActions}>
            {rides.length > 0 ? (
              <>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{t('driverDashboard.openCount', { count: rides.length })}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRideRequestsCollapsed(true)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('driverDashboard.collapseRideRequestsA11y')}
                >
                  <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
        {biddingFeedError === 'permission' ? (
          <View style={styles.feedErrorCard}>
            <Ionicons name="shield-outline" size={28} color={theme.colors.error} />
            <Text style={styles.feedErrorTitle}>{t('driverDashboard.feedPermTitle')}</Text>
            <Text style={styles.feedErrorSub}>{t('driverDashboard.feedPermSub')}</Text>
          </View>
        ) : null}
        {biddingFeedError === 'index' ? (
          <View style={styles.feedErrorCard}>
            <Ionicons name="construct-outline" size={28} color={theme.colors.primary} />
            <Text style={styles.feedErrorTitle}>{t('driverDashboard.feedIndexTitle')}</Text>
            <Text style={styles.feedErrorSub}>{t('driverDashboard.feedIndexSub')}</Text>
          </View>
        ) : null}
        {biddingFeedError === 'other' ? (
          <View style={styles.feedErrorCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={theme.colors.textSecondary} />
            <Text style={styles.feedErrorTitle}>{t('driverDashboard.feedSyncTitle')}</Text>
            <Text style={styles.feedErrorSub}>{t('driverDashboard.feedSyncSub')}</Text>
          </View>
        ) : null}
        {rides.length === 0 && !biddingFeedError ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name={isOnline ? 'radio-outline' : 'moon-outline'}
              size={28}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.emptyTitle}>
              {isOnline ? t('driverDashboard.emptyOnline') : t('driverDashboard.emptyOffline')}
            </Text>
            <Text style={styles.emptySub}>
              {isOnline ? t('driverDashboard.emptyOnlineSub') : t('driverDashboard.emptyOfflineSub')}
            </Text>
          </View>
        ) : null}
        {rides.length > 0 ? (
          <FlatList
            data={rides}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            extraData={{ riderPhotoTick, watchRideIdsKey: biddingWatchIdsKey }}
            snapToInterval={RIDE_CARD_WIDTH + RIDE_CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={styles.rideListContent}
            renderItem={({ item }) => {
              const showRiderAvatar = watchRideIdsArray.includes(item.id) && item.riderId;
              const riderUri =
                showRiderAvatar && item.riderId
                  ? riderPhotoCacheRef.current[String(item.riderId)]?.uri
                  : null;
              const driverEarns = getDriverEarnsFromRide(item);
              return (
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  {showRiderAvatar ? (
                    riderUri ? (
                      <Image source={{ uri: riderUri }} style={styles.cardRiderAvatar} />
                    ) : (
                      <View style={[styles.cardRiderAvatar, styles.cardRiderAvatarPh]}>
                        <Ionicons name="person" size={18} color={theme.colors.primary} />
                      </View>
                    )
                  ) : null}
                  <Text style={styles.riderName} numberOfLines={1}>
                    {item.riderName}
                  </Text>
                  <View style={styles.cardPriceCol}>
                    <Text style={styles.price}>
                      {t('driverDashboard.youEarn', { amount: formatJmdPrimary(driverEarns) })}
                    </Text>
                    <DriverFareGradeTag
                      tier={getDriverFareGrade(driverEarns, getDriverEarnsFromRide(item))}
                      theme={theme}
                      t={t}
                      compact
                    />
                  </View>
                </View>
                <Text style={styles.route} numberOfLines={2} ellipsizeMode="tail">
                  {formatRequestRouteSummary(item.pickup, item.dropoff, item.stops, t)}
                </Text>
                {(item.useRedeem || (item.splitCount || 1) > 1) && (
                  <View style={styles.tagRow}>
                    {item.useRedeem ? (
                      <View style={styles.coinsTagCompact}>
                        <Ionicons name="wallet-outline" size={12} color={theme.colors.secondary} />
                        <Text style={styles.coinsTagCompactText}>
                          {t('driverDashboard.coinsTagCompact', {
                            amount: formatJmdPrimary(REDEEM_DISCOUNT),
                          })}
                        </Text>
                      </View>
                    ) : null}
                    {(item.splitCount || 1) > 1 ? (
                      <View style={styles.splitTagCompact}>
                        <Ionicons name="people" size={12} color={theme.colors.primary} />
                        <Text style={styles.splitTagCompactText}>
                          {t('driverDashboard.splitTag', { count: item.splitCount })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
                {item.foodStop && (
                  <View style={styles.foodStopBanner}>
                    <Text style={styles.foodStopText} numberOfLines={3}>
                      {(() => {
                        const c = getDriverFoodStopCardCopy(item.foodStop, item);
                        return c ? `${c.title}\n${c.subtitle}` : t('driverDashboard.foodRouteFallback');
                      })()}
                    </Text>
                    <TouchableOpacity
                      style={styles.markPickedUpBtn}
                      onPress={() => handleMarkPickedUp(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('driverDashboard.a11yMarkPickedUp')}
                    >
                      <Text style={styles.markPickedUpText}>{t('driverDashboard.pickedUp')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.navToPickupBtn}
                  onPress={() => openPickupMaps(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('driverDashboard.a11yOpenPickupDir')}
                >
                  <Ionicons name="navigate" size={15} color={theme.colors.onPrimary} />
                  <Text style={styles.navToPickupText}>{t('driverDashboard.maps')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cardRespondBtn}
                  onPress={() => openRespondModal(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('driverDashboard.a11yRespondRequest')}
                  activeOpacity={0.88}
                >
                  <Text style={styles.cardRespondText}>{t('driverDashboard.respond')}</Text>
                </TouchableOpacity>
              </View>
              );
            }}
          />
        ) : null}
          </>
        )}
        {activeRide && (
            <View style={styles.activeRideBanner}>
              <TouchableOpacity
                style={styles.activeRideBannerHeader}
                onPress={() => rootNavigate('DriverActiveRide', { ride: activeRide })}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate-circle" size={22} color={theme.colors.white} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeRideText}>
                    {t('driverDashboard.activeRide', {
                      name: activeRide.riderName || t('driverDashboard.riderFallback'),
                      amount: formatJmdPrimary(getDriverEarnsFromRide(activeRide)),
                    })}
                  </Text>
                  <Text style={styles.activeRideSub}>{t('driverDashboard.activeRideSub')}</Text>
                  {activeRide?.foodStop && activeFoodOrder && (
                    <Text style={styles.activeFoodStatus}>
                      {t('driverDashboard.vendorPrefix')}{' '}
                      {FOOD_ORDER_STATUS_LABEL[normalizeFoodOrderStatus(activeFoodOrder.status)] ||
                        activeFoodOrder.status}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
              <View style={[styles.activeRideNavRow, showActiveSecondNavRow && styles.activeRideNavRowSpaced]}>
                <TouchableOpacity
                  style={[styles.activeRideNavBtn, activeRidePickupLegDone && styles.activeRideNavBtnMuted]}
                  onPress={() => openPickupMaps(activeRide)}
                  disabled={activeRidePickupLegDone}
                  activeOpacity={activeRidePickupLegDone ? 1 : 0.85}
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeRidePickupLegDone
                      ? t('driverDashboard.a11yPickupNavDone')
                      : t('driverDashboard.a11yNavPickup')
                  }
                  accessibilityState={{ disabled: activeRidePickupLegDone }}
                >
                  <Ionicons
                    name={activeRidePickupLegDone ? 'checkmark-circle' : 'navigate'}
                    size={18}
                    color={theme.colors.white}
                  />
                  <Text style={styles.activeRideNavBtnText} numberOfLines={2}>
                    {activeRidePickupLegDone
                      ? t('driverDashboard.navPickupDone')
                      : t('driverDashboard.navPickup')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.activeRideNavBtn,
                    styles.activeRideNavBtnDropoff,
                    !postPickupIntermediateUnlocked && styles.activeRideNavBtnMuted,
                  ]}
                  onPress={() => openDropoffMaps(activeRide)}
                  disabled={!postPickupIntermediateUnlocked}
                  activeOpacity={!postPickupIntermediateUnlocked ? 1 : 0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('driverDashboard.navDropoff')}
                  accessibilityState={{ disabled: !postPickupIntermediateUnlocked }}
                >
                  <Ionicons name="navigate" size={18} color={theme.colors.white} />
                  <Text style={styles.activeRideNavBtnText} numberOfLines={2}>
                    {t('driverDashboard.navDropoff')}
                  </Text>
                </TouchableOpacity>
              </View>
              {showActiveSecondNavRow ? (
                <View style={styles.activeRideNavRow}>
                  {showActiveFoodNavBtn ? (
                    <TouchableOpacity
                      style={[
                        styles.activeRideNavBtn,
                        styles.activeRideNavBtnFood,
                        (!activeRidePickupLegDone || !!activeRide?.foodStop?.bothAtStopConfirmedAt) &&
                          styles.activeRideNavBtnMuted,
                      ]}
                      onPress={() => openFoodStopMaps(activeRide)}
                      disabled={!activeRidePickupLegDone || !!activeRide?.foodStop?.bothAtStopConfirmedAt}
                      activeOpacity={
                        !activeRidePickupLegDone || !!activeRide?.foodStop?.bothAtStopConfirmedAt ? 1 : 0.85
                      }
                      accessibilityRole="button"
                      accessibilityLabel={
                        activeRide?.foodStop?.bothAtStopConfirmedAt
                          ? t('driverDashboard.a11yFoodDone')
                          : t('driverDashboard.a11yFoodPickup')
                      }
                      accessibilityState={{
                        disabled: !activeRidePickupLegDone || !!activeRide?.foodStop?.bothAtStopConfirmedAt,
                      }}
                    >
                      <Ionicons
                        name={activeRide?.foodStop?.bothAtStopConfirmedAt ? 'checkmark-circle' : 'fast-food'}
                        size={18}
                        color={theme.colors.white}
                      />
                      <Text style={styles.activeRideNavBtnText} numberOfLines={2}>
                        {activeRide?.foodStop?.bothAtStopConfirmedAt
                          ? t('driverDashboard.foodStopDone')
                          : t('driverDashboard.foodVendor')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {showActiveRouteStopsNavBtn ? (
                    <TouchableOpacity
                      style={[
                        styles.activeRideNavBtn,
                        styles.activeRideNavBtnStops,
                        !postPickupIntermediateUnlocked && styles.activeRideNavBtnMuted,
                      ]}
                      onPress={() => openRouteStopsMaps(activeRide)}
                      disabled={!postPickupIntermediateUnlocked}
                      activeOpacity={!postPickupIntermediateUnlocked ? 1 : 0.85}
                      accessibilityRole="button"
                      accessibilityLabel={t('driverDashboard.a11yRouteStops')}
                      accessibilityState={{ disabled: !postPickupIntermediateUnlocked }}
                    >
                      <Ionicons name="flag-outline" size={18} color={theme.colors.white} />
                      <Text style={styles.activeRideNavBtnText} numberOfLines={2}>
                        {extraStopNavTargets.length > 1
                          ? t('driverDashboard.routeStopsMany')
                          : t('driverDashboard.routeStopOne')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {!activeRidePickupLegDone ? (
                <Text style={styles.activeRideNavHint}>
                  {t('driverDashboard.activeNavHintPickup')}
                  {showActiveSecondNavRow
                    ? t('driverDashboard.activeNavHintThenStops')
                    : t('driverDashboard.activeNavHintThenDropoff')}
                </Text>
              ) : activeRideNeedsFoodStopLeg && !activeRide?.foodStop?.bothAtStopConfirmedAt ? (
                <Text style={styles.activeRideNavHint}>{t('driverDashboard.activeNavHintFood')}</Text>
              ) : null}
            </View>
        )}
      </View>
      <Modal
        visible={routeStopsNavPicker != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRouteStopsNavPicker(null)}
      >
        <View style={styles.respondModalRoot}>
          <Pressable
            style={styles.respondModalBackdrop}
            onPress={() => setRouteStopsNavPicker(null)}
            accessibilityLabel={t('driverDashboard.a11yCloseRouteStops')}
          />
          <SafeAreaView edges={['bottom']} style={styles.respondModalSheet}>
            <Text style={styles.modalTitle}>{t('driverDashboard.routeStopsTitle')}</Text>
            <Text style={styles.modalRouteDetail}>{t('driverDashboard.routeStopsSub')}</Text>
            <ScrollView
              style={styles.routeStopPickerScroll}
              contentContainerStyle={styles.routeStopPickerScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {routeStopsNavPicker?.targets.map((tgt, idx) => (
                <TouchableOpacity
                  key={`rs-${idx}-${tgt.lat}-${tgt.lng}`}
                  style={styles.routeStopPickerItem}
                  activeOpacity={0.88}
                  onPress={() => {
                    setRouteStopsNavPicker(null);
                    Alert.alert(
                      t('driverDashboard.navOpenTitle'),
                      t('driverDashboard.navChooseApp', { label: tgt.label }),
                      [
                        { text: t('driverDashboard.cancel'), style: 'cancel' },
                        ...directionsAlertActions(tgt.lat, tgt.lng, tgt.label),
                      ],
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('driverDashboard.a11yNavTo', { label: tgt.label })}
                >
                  <Ionicons name="navigate" size={20} color={theme.colors.primary} />
                  <Text style={styles.routeStopPickerItemText} numberOfLines={4}>
                    {tgt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.routeStopPickerCancelBtn}
              onPress={() => setRouteStopsNavPicker(null)}
              activeOpacity={0.88}
            >
              <Text style={styles.routeStopPickerCancelText}>{t('driverDashboard.cancel')}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={showSubscriptionModal && !selectedRide}
        transparent
        animationType="slide"
        onRequestClose={dismissSubscriptionModal}
      >
        <View style={styles.subscriptionSheetRoot}>
          <Pressable
            style={styles.subscriptionSheetBackdrop}
            onPress={dismissSubscriptionModal}
            accessibilityLabel={t('driverDashboard.a11yCloseSubscription')}
          />
          <SafeAreaView edges={['bottom']} style={styles.subscriptionSheetCard}>
            <Text style={styles.subscriptionSheetTitle}>{t('driverDashboard.subscriptionTitle')}</Text>
            <ScrollView
              style={styles.subscriptionSheetScroll}
              contentContainerStyle={styles.subscriptionSheetScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              nestedScrollEnabled
            >
              <Text style={styles.subscriptionModalText} selectable>
                {t('driverDashboard.subscriptionBody', {
                  dayRate: formatJmdPrimary(getDriverDailyFeeJmd(userProfile, usdTable)),
                  referBonus: formatJmdPrimary(getReferralFirstDayFeeJmd(userProfile, usdTable)),
                })}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.subscriptionSheetButton} onPress={dismissSubscriptionModal} activeOpacity={0.85}>
              <Text style={styles.subscriptionSheetButtonText}>{t('driverDashboard.gotIt')}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={!!selectedRide}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeRespondModal}
      >
        <View style={styles.respondModalRoot}>
          <Pressable
            style={styles.respondModalBackdrop}
            onPress={closeRespondModal}
            accessibilityLabel={t('driverDashboard.a11yClose')}
          />
          <RespondModalKeyboardAvoid
            style={[styles.respondModalKeyboardAvoid, { maxHeight: respondModalSheetHeight }]}
          >
            <SafeAreaView edges={['bottom']} style={styles.respondModalSheet}>
              <RespondModalKeyboardScroll
              scrollRef={respondModalScrollRef}
              insetsBottom={insets.bottom}
              style={[styles.respondModalScroll, { maxHeight: respondModalSheetHeight - 32 }]}
              contentContainerStyle={styles.respondModalScrollContent}
            >
              <Text style={styles.modalTitle}>
                {t('driverDashboard.modalRespond', {
                  name: selectedRide?.riderName || t('driverDashboard.riderFallback'),
                })}
              </Text>
              <Text style={styles.modalSub}>
                {t('driverDashboard.modalYouEarnLine', {
                  amount: formatJmdPrimary(respondModalDriverEarns),
                })}
                {selectedRide?.foodStop && (Number(selectedRide.foodStop.itemsTotal) || 0) > 0
                  ? t('driverDashboard.modalYouEarnFoodNote')
                  : ''}
              </Text>
              {selectedRide ? (
                <View style={styles.modalFareGradeWrap}>
                  <DriverFareGradeTag
                    tier={getDriverFareGrade(respondModalDriverEarns, respondModalListedDriverEarns)}
                    theme={theme}
                    t={t}
                  />
                </View>
              ) : null}
              <Text style={styles.modalRouteDetail} numberOfLines={4}>
                {selectedRide
                  ? formatRequestRouteSummary(
                      selectedRide.pickup,
                      selectedRide.dropoff,
                      selectedRide.stops,
                      t,
                    )
                  : ''}
              </Text>
              {selectedRide?.useRedeem ? (
                <View style={styles.modalTagRow}>
                  <Ionicons name="wallet-outline" size={16} color={theme.colors.secondary} />
                  <Text style={styles.modalTagText}>
                    {t('driverDashboard.modalCoinsTag', {
                      amount: formatJmdPrimary(REDEEM_DISCOUNT),
                    })}
                  </Text>
                </View>
              ) : null}
              {selectedRide && (selectedRide.splitCount || 1) > 1 ? (
                <Text style={styles.modalSplitHint}>
                  {t('driverDashboard.modalSplitNegotiate', { count: selectedRide.splitCount })}
                </Text>
              ) : null}
              {selectedRide?.foodStop ? (
                <View style={styles.modalFoodBox}>
                  <Text style={styles.modalFoodTitle}>{t('driverDashboard.modalFoodTitle')}</Text>
                  <Text style={styles.modalFoodBody} numberOfLines={4}>
                    {(() => {
                      const c = getDriverFoodStopCardCopy(selectedRide.foodStop, selectedRide);
                      return c ? `${c.title}\n${c.subtitle}` : t('driverDashboard.foodRouteFallback');
                    })()}
                  </Text>
                </View>
              ) : null}
              {latestRiderCounterForModal && selectedRide ? (
                <Text style={styles.riderCounterNote}>
                  {t('driverDashboard.riderCounterLine', {
                    amount: formatJmdPrimary(
                      driverEarnsFromRiderAllIn(
                        selectedRide,
                        Number(
                          latestRiderCounterForModal.price ??
                            latestRiderCounterForModal.counterPrice ??
                            0,
                        ),
                      ),
                    ),
                  })}
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.modalMapsBtn}
                onPress={() => selectedRide && openPickupMaps(selectedRide)}
                activeOpacity={0.88}
              >
                <Ionicons name="navigate" size={18} color={theme.colors.onPrimary} />
                <Text style={styles.modalMapsBtnText}>{t('driverDashboard.pickupMaps')}</Text>
              </TouchableOpacity>
              <View style={[styles.respondModalFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <Text style={styles.modalCounterLabel}>
                  {t('driverDashboard.modalCounterLabel', { currency: currencyCode })}
                </Text>
                <ThemedTextInput
                  style={styles.modalInput}
                  placeholder={t('driverDashboard.minTripPlaceholder', {
                    min: formatJmdPrimary(MIN_FARE_JMD),
                  })}
                  value={counterPrice}
                  onChangeText={setCounterPrice}
                  onFocus={scrollRespondModalToInput}
                  keyboardType="number-pad"
                />
                <View style={styles.modalBidRow}>
                  <TouchableOpacity
                    style={styles.modalRejectOutlineBtn}
                    onPress={handleModalReject}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.modalRejectOutlineText}>{t('driverDashboard.reject')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAcceptSolidBtn}
                    onPress={handleModalAccept}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.modalAcceptSolidText}>{t('driverDashboard.accept')}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.modalSendCounterBtn}
                  onPress={handleSendCounter}
                  activeOpacity={0.88}
                >
                  <Text style={styles.modalSendCounterText}>{t('driverDashboard.sendCounter')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCloseOnlyBtn}
                  onPress={closeRespondModal}
                  activeOpacity={0.88}
                >
                  <Text style={styles.modalCloseOnlyText}>{t('driverDashboard.close')}</Text>
                </TouchableOpacity>
              </View>
              </RespondModalKeyboardScroll>
            </SafeAreaView>
          </RespondModalKeyboardAvoid>
        </View>
      </Modal>

      <Modal
        visible={!!popupRide && !selectedRide}
        transparent
        animationType="none"
        onRequestClose={closeDriverRequestPopup}
      >
        <View style={styles.popupRoot}>
          <Animated.View style={[styles.popupBackdropDim, { opacity: popupBackdropOpacity }]} />
          <Pressable
            style={styles.popupBackdropPress}
            onPress={closeDriverRequestPopup}
            accessibilityLabel={t('driverDashboard.a11yDismiss')}
          />
          <Animated.View
            style={[
              styles.popupSheet,
              {
                opacity: popupSheetOpacity,
                transform: [{ translateY: popupSheetTranslate }],
              },
            ]}
          >
            <SafeAreaView edges={['bottom']} style={styles.popupSafe}>
              <View style={styles.popupHandle} />
              <View style={styles.popupHeader}>
                <View
                  style={[
                    styles.popupBadge,
                    popupVariant === 'riderCounter' ? styles.popupBadgeRiderCounter : null,
                  ]}
                >
                  <Text style={styles.popupBadgeText}>
                    {popupVariant === 'riderCounter'
                      ? t('driverDashboard.popupBadgeCounter')
                      : t('driverDashboard.popupBadgeNew')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (popupRide?.id) skippedPopupIdsRef.current.add(popupRide.id);
                    closeDriverRequestPopup();
                  }}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {popupRide?.id && watchRideIdsArray.includes(popupRide.id) && popupRide?.riderId ? (
                <View style={styles.popupAvatarRow}>
                  {popupRiderPhotoUri ? (
                    <Image source={{ uri: popupRiderPhotoUri }} style={styles.popupRiderAvatar} />
                  ) : (
                    <View style={[styles.popupRiderAvatar, styles.popupRiderAvatarPh]}>
                      <Ionicons name="person" size={28} color={theme.colors.primary} />
                    </View>
                  )}
                </View>
              ) : null}
              <Text style={styles.popupRider}>{popupRide?.riderName}</Text>
              <Text style={styles.popupPrice}>
                {t('driverDashboard.modalYouEarnLine', {
                  amount: formatJmdPrimary(popupDriverEarnsDisplay),
                })}
              </Text>
              {popupRide ? (
                <View style={styles.popupFareGradeWrap}>
                  <DriverFareGradeTag
                    tier={getDriverFareGrade(
                      popupDriverEarnsDisplay,
                      Math.round(getDriverEarnsFromRide(popupRide)),
                    )}
                    theme={theme}
                    t={t}
                  />
                </View>
              ) : null}
              {popupVariant === 'riderCounter' ? (
                <Text style={styles.popupDriverCaption}>{t('driverDashboard.popupRiderCounterCaption')}</Text>
              ) : popupRide?.foodStop && getVendorFoodItemsTotal(popupRide) > 0 ? (
                <Text style={styles.popupDriverCaption}>{t('driverDashboard.fareCaptionFood')}</Text>
              ) : null}
              <Text style={styles.popupRoute} numberOfLines={3} ellipsizeMode="tail">
                {popupRide
                  ? formatRequestRouteSummary(popupRide.pickup, popupRide.dropoff, popupRide.stops, t)
                  : ''}
              </Text>
              {popupRide?.useRedeem ? (
                <View style={styles.popupCoinsRow}>
                  <Ionicons name="wallet-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.popupCoinsText}>
                    {t('driverDashboard.popupCoinsLong', { amount: formatJmdPrimary(REDEEM_DISCOUNT) })}
                  </Text>
                </View>
              ) : null}
              {popupRide && (popupRide.splitCount || 1) > 1 ? (
                <View style={styles.popupSplitRow}>
                  <Ionicons name="people" size={18} color={theme.colors.primary} />
                  <Text style={styles.popupSplitText}>
                    {t('driverDashboard.popupSplitWays', { count: popupRide.splitCount })}
                  </Text>
                </View>
              ) : null}
              {popupRide?.foodStop ? (
                <View style={styles.popupFood}>
                  <Ionicons name="fast-food-outline" size={18} color={theme.colors.orange} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.popupFoodText} numberOfLines={2}>
                      {t('driverDashboard.popupFoodPickup', {
                        vendor: popupRide.foodStop.vendorName || '',
                      })}
                    </Text>
                    {popupFoodOrder ? (
                      <Text style={styles.popupFoodStatus}>
                        {t('driverDashboard.foodKitchen')}{' '}
                        {FOOD_ORDER_STATUS_LABEL[normalizeFoodOrderStatus(
                          popupFoodOrder.status,
                        )] || popupFoodOrder.status}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.popupMapsBtn}
                onPress={() => {
                  if (popupRide) openPickupMaps(popupRide);
                }}
              >
                <Ionicons name="navigate" size={18} color={theme.colors.onPrimary} />
                <Text style={styles.popupMapsText}>{t('driverDashboard.popupMaps')}</Text>
              </TouchableOpacity>
              <View style={styles.popupActions}>
                <TouchableOpacity
                  style={styles.popupSecondaryBtn}
                  onPress={() => {
                    if (popupRide?.id) skippedPopupIdsRef.current.add(popupRide.id);
                    closeDriverRequestPopup();
                  }}
                >
                  <Text style={styles.popupSecondaryText}>{t('driverDashboard.inList')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.popupRespondFullBtn}
                  onPress={() => {
                    const r = popupRide;
                    if (!r) return;
                    if (
                      popupVariant === 'riderCounter' &&
                      riderCounterPopupMeta &&
                      Number.isFinite(riderCounterPopupMeta.driverEarns)
                    ) {
                      openRespondModal(r, { suggestedDriverEarns: riderCounterPopupMeta.driverEarns });
                    } else {
                      openRespondModal(r);
                    }
                  }}
                >
                  <Text style={styles.popupRespondFullText}>{t('driverDashboard.respondFull')}</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

export default withSectionGuide(DriverDashboardScreen, 'driver_dashboard');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, width: '100%' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: theme.colors.surface,
    zIndex: 2,
  },
  driverTopBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 14,
    zIndex: 30,
  },
  approvalBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  approvalBannerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  approvalBannerSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 4, lineHeight: 18 },
  onlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  todayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '12',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  todayStripLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.3 },
  todayStripValue: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  onlineText: { fontSize: 16, fontWeight: 'bold' },
  goOfflineWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goOfflineText: { fontSize: 14, color: theme.colors.accent, fontWeight: '600' },
  cancelOfflineBtn: { paddingVertical: 4, paddingHorizontal: 12, backgroundColor: theme.colors.error + '30', borderRadius: 8 },
  cancelOfflineText: { fontSize: 13, color: theme.colors.error, fontWeight: 'bold' },
  title: { fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rideRequestsCollapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  rideRequestsCollapsedTitle: { fontSize: 15, fontWeight: '800' },
  rideRequestsCollapsedSub: { fontSize: 12, fontWeight: '600', marginTop: 2, lineHeight: 16 },
  countPill: {
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  countPillText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  feedErrorCard: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryLight,
    gap: 8,
  },
  feedErrorTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 4 },
  feedErrorSub: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 6 },
  emptySub: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  rideListContent: { paddingBottom: 4, paddingTop: 2 },
  card: {
    width: RIDE_CARD_WIDTH,
    backgroundColor: theme.colors.surface,
    padding: 10,
    borderRadius: 10,
    marginRight: RIDE_CARD_GAP,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  cardRiderAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryLight },
  cardRiderAvatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary + '18',
  },
  riderName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '800', color: theme.colors.primary },
  route: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    lineHeight: 15,
  },
  cardPriceCol: { alignItems: 'flex-end', maxWidth: '46%', gap: 6 },
  price: { fontSize: 14, fontWeight: '800', color: theme.colors.accent, textAlign: 'right' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  coinsTagCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.secondary + '18',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  coinsTagCompactText: { fontSize: 10, fontWeight: '700', color: theme.colors.primary },
  splitTagCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primary + '14',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  splitTagCompactText: { fontSize: 10, fontWeight: '700', color: theme.colors.primary },
  foodStopBanner: {
    backgroundColor: theme.colors.orange + '25',
    padding: 6,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.colors.orange,
  },
  foodStopText: { fontSize: 11, color: theme.colors.orange, fontWeight: '600', lineHeight: 15 },
  markPickedUpBtn: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.green,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markPickedUpText: { fontSize: 12, color: theme.colors.white, fontWeight: '800' },
  navToPickupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: theme.colors.primary,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  navToPickupText: { color: theme.colors.onPrimary, fontSize: 11, fontWeight: '800' },
  cardRespondBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
    marginBottom: 2,
  },
  cardRespondText: { color: theme.colors.white, fontSize: 12, fontWeight: '800' },
  activeRideBanner: {
    flexDirection: 'column',
    backgroundColor: theme.colors.success,
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  activeRideBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeRideNavRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  activeRideNavRowSpaced: {
    marginBottom: 8,
  },
  activeRideNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  activeRideNavBtnDropoff: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark || theme.colors.primary,
  },
  activeRideNavBtnFood: {
    backgroundColor: theme.colors.orange,
    borderColor: theme.colors.orange,
  },
  activeRideNavBtnStops: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  activeRideNavBtnMuted: {
    opacity: 0.42,
  },
  activeRideNavBtnText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  activeRideNavHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '600',
  },
  routeStopPickerScroll: { maxHeight: 360 },
  routeStopPickerScrollContent: { paddingBottom: 8 },
  routeStopPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '10',
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    marginBottom: 8,
  },
  routeStopPickerItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  routeStopPickerCancelBtn: {
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  routeStopPickerCancelText: { fontSize: 15, fontWeight: '800', color: theme.colors.textSecondary },
  popupRoot: { flex: 1, justifyContent: 'flex-end' },
  popupBackdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popupBackdropPress: { ...StyleSheet.absoluteFillObject },
  popupSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.primaryLight,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 20 },
    }),
  },
  popupSafe: { paddingHorizontal: 20, paddingBottom: 12 },
  popupHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primaryLight,
    marginTop: 8,
    marginBottom: 12,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  popupBadge: {
    backgroundColor: theme.colors.orange,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  popupBadgeRiderCounter: {
    backgroundColor: theme.colors.accent,
  },
  popupBadgeText: { color: theme.colors.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  popupDriverCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 8,
    lineHeight: 17,
  },
  popupAvatarRow: { alignItems: 'center', marginBottom: 10 },
  popupRiderAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryLight,
  },
  popupRiderAvatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary + '18',
  },
  popupRider: { fontSize: 22, fontWeight: '800', color: theme.colors.primary },
  popupPrice: { fontSize: 30, fontWeight: '800', color: theme.colors.accent, marginTop: 6, letterSpacing: -0.5 },
  popupFareGradeWrap: { marginTop: 12, marginBottom: 2, alignSelf: 'stretch' },
  popupRoute: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 10, lineHeight: 20 },
  popupCoinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 12,
    backgroundColor: theme.colors.primary + '12',
    borderRadius: 10,
  },
  popupCoinsText: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  popupSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  popupSplitText: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.primary, lineHeight: 18 },
  popupFood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: theme.colors.orange + '15',
    borderRadius: 10,
  },
  popupFoodText: { fontSize: 13, color: theme.colors.orange, fontWeight: '600' },
  popupFoodStatus: { fontSize: 12, color: theme.colors.primary, fontWeight: '800', marginTop: 6 },
  popupMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  popupMapsText: { fontSize: 15, fontWeight: '800', color: theme.colors.onPrimary },
  popupActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  popupSecondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  popupSecondaryText: { fontWeight: '700', color: theme.colors.textSecondary, fontSize: 14 },
  popupRespondFullBtn: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
  },
  popupRespondFullText: { fontWeight: '800', color: theme.colors.white, fontSize: 14 },
  activeRideText: { color: theme.colors.white, fontWeight: 'bold', fontSize: 14 },
  activeRideSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  activeFoodStatus: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  respondModalRoot: { flex: 1, justifyContent: 'flex-end' },
  respondModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  respondModalSheet: {
    backgroundColor: theme.colors.white,
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    zIndex: 1,
  },
  respondModalKeyboardAvoid: {
    width: '100%',
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  respondModalScroll: { width: '100%', alignSelf: 'stretch' },
  respondModalScrollContent: { paddingBottom: 36 },
  respondModalFooter: {
    flexShrink: 0,
    width: '100%',
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.primary + '33',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  modalRouteDetail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  modalTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.primary + '12',
    borderRadius: 10,
  },
  modalTagText: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  modalFoodBox: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: theme.colors.orange + '18',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.orange,
  },
  modalFoodTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.orange, marginBottom: 4 },
  modalFoodBody: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  modalMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    marginBottom: 14,
  },
  modalMapsBtnText: { fontSize: 15, fontWeight: '800', color: theme.colors.onPrimary },
  modalCounterLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  modalBidRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  modalRejectOutlineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surface,
  },
  modalRejectOutlineText: { fontWeight: '800', color: theme.colors.error, fontSize: 14 },
  modalAcceptSolidBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.success,
  },
  modalAcceptSolidText: { fontWeight: '800', color: theme.colors.white, fontSize: 14 },
  modalSendCounterBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.secondary,
    marginBottom: 8,
  },
  modalSendCounterText: { fontWeight: '800', color: theme.colors.white, fontSize: 15 },
  modalCloseOnlyBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
  },
  modalCloseOnlyText: { fontWeight: '700', color: theme.colors.textSecondary, fontSize: 14 },
  subscriptionSheetRoot: { flex: 1, justifyContent: 'flex-end' },
  subscriptionSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  subscriptionSheetCard: {
    backgroundColor: theme.colors.white,
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  subscriptionSheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 12,
  },
  subscriptionSheetScroll: { maxHeight: 320 },
  subscriptionSheetScrollContent: { paddingBottom: 4 },
  subscriptionModalText: { fontSize: 16, color: theme.colors.text, lineHeight: 24 },
  subscriptionSheetButton: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  subscriptionSheetButtonText: { color: theme.colors.white, fontWeight: 'bold' },
  modalSub: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  modalFareGradeWrap: { marginBottom: 12, alignSelf: 'stretch' },
  modalSplitHint: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 10,
    lineHeight: 18,
  },
  riderCounterNote: { fontSize: 13, color: theme.colors.primary, marginBottom: 12 },
  modalInput: { borderWidth: 2, borderColor: theme.colors.primaryLight, borderRadius: 12, padding: 14, fontSize: 18, marginBottom: 12 },
});
