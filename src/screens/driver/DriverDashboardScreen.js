import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Switch,
  Alert,
  TextInput,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { navigate as rootNavigate } from '../../navigation/navigationRef';
import {
  subscribeToBiddingRides,
  addBid,
  updateDriverOnlineStatus,
  updateDriverLocation,
  subscribeToBids,
  subscribeToDriverActiveRide,
} from '../../services/rideService';
import { updateFoodOrderStatus } from '../../services/foodOrderService';
import { isFirebaseReady } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { withSectionGuide } from '../../components/withSectionGuide';

const SUBSCRIPTION_INFO_KEY = 'armada_driver_subscription_info_seen';

function DriverDashboardScreen() {
  const { theme } = useTheme();
  const tabNavigation = useNavigation();
  const { userProfile } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [rides, setRides] = useState([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [selectedRide, setSelectedRide] = useState(null);
  const [bidsForRide, setBidsForRide] = useState([]);
  const [counterPrice, setCounterPrice] = useState('');
  const [goOfflineCountdown, setGoOfflineCountdown] = useState(null);
  const [popupRide, setPopupRide] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const goOfflineTimerRef = useRef(null);
  const autoOfflineRef = useRef(null);
  const prevRideIdsRef = useRef(null);
  const skippedPopupIdsRef = useRef(new Set());

  useEffect(() => {
    if (!isFirebaseReady) return;
    const unsub = subscribeToBiddingRides((firebaseRides) => {
      setRides(
        firebaseRides.map((r) => ({
          id: r.id,
          riderName: r.riderName || 'Rider',
          pickup: r.pickup,
          dropoff: r.dropoff,
          stops: r.stops || [],
          bidPrice: r.bidPrice,
          foodStop: r.foodStop,
          riderId: r.riderId,
          useRedeem: !!r.useRedeem,
        }))
      );
    });
    return unsub;
  }, []);

  useLayoutEffect(() => {
    const n = rides.length;
    tabNavigation.setOptions({
      tabBarBadge: isOnline && n > 0 ? (n > 99 ? '99+' : n) : undefined,
    });
  }, [tabNavigation, rides.length, isOnline]);

  useEffect(() => {
    if (!isOnline) {
      setPopupRide(null);
      return;
    }
    const ids = rides.map((r) => r.id);
    if (prevRideIdsRef.current === null) {
      prevRideIdsRef.current = new Set(ids);
      return;
    }
    const prev = prevRideIdsRef.current;
    const newlyAdded = rides.filter(
      (r) => !prev.has(r.id) && !skippedPopupIdsRef.current.has(r.id)
    );
    prevRideIdsRef.current = new Set(ids);
    if (newlyAdded.length > 0) {
      setPopupRide(newlyAdded[0]);
    }
  }, [rides, isOnline]);

  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id) return;
    const unsub = subscribeToDriverActiveRide(userProfile.id, setActiveRide);
    return unsub;
  }, [userProfile?.id]);

  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id) return;
    updateDriverOnlineStatus(userProfile.id, isOnline).catch(() => {});
  }, [isOnline, userProfile?.id]);

  // Publish driver location to RTDB while online (for getNearbyDrivers / rider map)
  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id || !isOnline || activeRide) return;
    let cancelled = false;
    let intervalId = null;
    const publish = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        updateDriverLocation(userProfile.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch {
        /* ignore */
      }
    };
    publish();
    intervalId = setInterval(publish, 120000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOnline, userProfile?.id, activeRide]);

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

  const dismissSubscriptionModal = () => {
    setShowSubscriptionModal(false);
    AsyncStorage.setItem(SUBSCRIPTION_INFO_KEY, 'yes');
  };

  const region = {
    latitude: 18.0179,
    longitude: -76.8099,
    latitudeDelta: 0.3,
    longitudeDelta: 0.3,
  };

  const handleBid = async (ride, action) => {
    if (action === 'accept') {
      if (!isFirebaseReady) {
        Alert.alert('Demo', `Accepted ${ride.riderName}'s ride for J$${ride.bidPrice}`);
        return;
      }
    try {
      lastActivityRef.current = Date.now();
      await addBid(ride.id, {
        driverId: userProfile?.id,
        driverName: userProfile?.name || 'Driver',
        price: ride.bidPrice,
        counterPrice: ride.bidPrice,
        rating: userProfile?.rating || 4.8,
      });
      Alert.alert('Bid sent', `Your acceptance at J$${ride.bidPrice} sent to ${ride.riderName}`);
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not send bid');
      }
    } else if (action === 'counter') {
      setSelectedRide(ride);
      setCounterPrice(String(ride.bidPrice + 100));
    } else {
      Alert.alert('Rejected', `Rejected ${ride.riderName}'s bid`);
    }
  };

  const handleSendCounter = async () => {
    const num = parseInt(counterPrice, 10);
    if (!selectedRide || isNaN(num) || num < 1) {
      Alert.alert('Invalid', 'Enter a valid price (J$)');
      return;
    }
    if (!isFirebaseReady) {
      Alert.alert('Demo', `Counter of J$${num} sent to ${selectedRide.riderName}`);
      setSelectedRide(null);
      setCounterPrice('');
      return;
    }
    try {
      lastActivityRef.current = Date.now();
      await addBid(selectedRide.id, {
        driverId: userProfile?.id,
        driverName: userProfile?.name || 'Driver',
        price: num,
        counterPrice: num,
        rating: userProfile?.rating || 4.8,
      });
      Alert.alert('Counter sent', `J$${num} sent to ${selectedRide.riderName}`);
      setSelectedRide(null);
      setCounterPrice('');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not send counter');
    }
  };

  const handleMarkPickedUp = async (ride) => {
    const foodOrderId = ride.foodStop?.foodOrderId;
    if (!foodOrderId) {
      Alert.alert('Demo', 'Food order not linked. In production, this updates the food_orders doc.');
      return;
    }
    try {
      await updateFoodOrderStatus(foodOrderId, 'picked-up');
      Alert.alert('Done', 'Food marked as picked up');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update');
    }
  };

  const styles = createStyles(theme);
  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} initialRegion={region}>
        <Marker coordinate={{ latitude: 18.0179, longitude: -76.8099 }} title="You" pinColor="green" />
        {rides.slice(0, 3).map((b, i) => (
          <Marker
            key={b.id}
            coordinate={{
              latitude: 18.02 + i * 0.01,
              longitude: -76.81 + i * 0.01,
            }}
            title={b.riderName}
            pinColor="blue"
          />
        ))}
      </MapView>
      <View style={styles.overlay}>
        <View style={styles.onlineRow}>
          <Text style={[styles.onlineText, { color: isOnline ? theme.colors.primary : theme.colors.textSecondary }]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
          {goOfflineCountdown !== null ? (
            <View style={styles.goOfflineWrap}>
              <Text style={styles.goOfflineText}>Going offline in {goOfflineCountdown}s</Text>
              <TouchableOpacity onPress={cancelGoOffline} style={styles.cancelOfflineBtn}>
                <Text style={styles.cancelOfflineText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Switch
              value={isOnline}
              onValueChange={handleOnlineChange}
              trackColor={{ true: theme.colors.primary }}
            />
          )}
        </View>
        <View style={styles.sectionHeader}>
          <Text style={styles.title}>Ride requests</Text>
          {rides.length > 0 && (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{rides.length} open</Text>
            </View>
          )}
        </View>
        {rides.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name={isOnline ? 'radio-outline' : 'moon-outline'}
              size={36}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.emptyTitle}>{isOnline ? 'No open requests right now' : "You're offline"}</Text>
            <Text style={styles.emptySub}>
              {isOnline
                ? 'Stay on this tab — new rider bids appear here and in a quick popup.'
                : 'Go online to see incoming ride requests from nearby riders.'}
            </Text>
          </View>
        ) : null}
        <FlatList
          data={rides}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          snapToInterval={292}
          decelerationRate="fast"
          contentContainerStyle={styles.rideListContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.riderName}>{item.riderName}</Text>
              <Text style={styles.route}>
                {[item.pickup, ...(item.stops || []), item.dropoff].filter(Boolean).join(' → ')}
              </Text>
              <Text style={styles.price}>J${item.bidPrice}</Text>
              {item.useRedeem && (
                <View style={styles.coinsTag}>
                  <Ionicons name="wallet-outline" size={14} color={theme.colors.secondary} />
                  <Text style={styles.coinsTagText}>Rider using Armada Coins (J$100 off)</Text>
                </View>
              )}
              {item.foodStop && (
                <View style={styles.foodStopBanner}>
                  <Text style={styles.foodStopText}>
                    Pick up: {item.foodStop.vendorName}
                    {item.foodStop.itemsTotal > 0 && ` – J$${item.foodStop.itemsTotal} items`}
                    {` – J$${item.foodStop.extraFee} detour`}
                  </Text>
                  <TouchableOpacity
                    style={styles.markPickedUpBtn}
                    onPress={() => handleMarkPickedUp(item)}
                  >
                    <Text style={styles.markPickedUpText}>Mark Picked Up</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => handleBid(item, 'reject')}>
                  <Text style={styles.btnText}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.counterBtn} onPress={() => handleBid(item, 'counter')}>
                  <Text style={styles.btnText}>Counter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleBid(item, 'accept')}>
                  <Text style={styles.btnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
        {activeRide && (
          <TouchableOpacity
            style={styles.activeRideBanner}
            onPress={() => rootNavigate('DriverActiveRide', { ride: activeRide })}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-circle" size={22} color={theme.colors.white} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeRideText}>
                Active ride: {activeRide.riderName || 'Rider'} · J${activeRide.finalFare || activeRide.bidPrice}
              </Text>
              <Text style={styles.activeRideSub}>Tap for details & payment status</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        )}
      </View>
      <Modal visible={showSubscriptionModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={dismissSubscriptionModal}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Driver Subscription</Text>
            <Text style={styles.subscriptionModalText}>
              • J$1,000 per 24 hours{'\n'}
              • First day FREE{'\n'}
              • After first payment, get a QR code in Profile to share with other drivers – they get 50% off (J$500) on their first day
            </Text>
            <TouchableOpacity style={styles.modalSendBtn} onPress={dismissSubscriptionModal}>
              <Text style={styles.modalSendText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal visible={!!popupRide} transparent animationType="fade" onRequestClose={() => setPopupRide(null)}>
        <Pressable style={styles.popupBackdrop} onPress={() => setPopupRide(null)}>
          <View style={styles.popupSheet}>
            <SafeAreaView edges={['bottom']} style={styles.popupSafe}>
              <View style={styles.popupHandle} />
              <View style={styles.popupHeader}>
                <View style={styles.popupBadge}>
                  <Text style={styles.popupBadgeText}>NEW REQUEST</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (popupRide?.id) skippedPopupIdsRef.current.add(popupRide.id);
                    setPopupRide(null);
                  }}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.popupRider}>{popupRide?.riderName}</Text>
              <Text style={styles.popupPrice}>J${popupRide?.bidPrice}</Text>
              <Text style={styles.popupRoute} numberOfLines={3}>
                {[popupRide?.pickup, ...(popupRide?.stops || []), popupRide?.dropoff].filter(Boolean).join(' → ')}
              </Text>
              {popupRide?.useRedeem ? (
                <View style={styles.popupCoinsRow}>
                  <Ionicons name="wallet-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.popupCoinsText}>Includes Armada Coins (rider pays J$100 less)</Text>
                </View>
              ) : null}
              {popupRide?.foodStop ? (
                <View style={styles.popupFood}>
                  <Ionicons name="fast-food-outline" size={18} color={theme.colors.orange} />
                  <Text style={styles.popupFoodText} numberOfLines={2}>
                    Food: {popupRide.foodStop.vendorName}
                    {popupRide.foodStop.itemsTotal > 0 ? ` · J$${popupRide.foodStop.itemsTotal}` : ''}
                  </Text>
                </View>
              ) : null}
              <View style={styles.popupActions}>
                <TouchableOpacity
                  style={styles.popupSecondaryBtn}
                  onPress={() => {
                    if (popupRide?.id) skippedPopupIdsRef.current.add(popupRide.id);
                    setPopupRide(null);
                  }}
                >
                  <Text style={styles.popupSecondaryText}>In list</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.popupCounterBtn}
                  onPress={() => {
                    const r = popupRide;
                    setPopupRide(null);
                    if (r) handleBid(r, 'counter');
                  }}
                >
                  <Text style={styles.popupCounterText}>Counter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.popupAcceptBtn}
                  onPress={() => {
                    const r = popupRide;
                    setPopupRide(null);
                    if (r) handleBid(r, 'accept');
                  }}
                >
                  <Text style={styles.popupAcceptText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedRide} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedRide(null)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Counter offer for {selectedRide?.riderName}</Text>
            <Text style={styles.modalSub}>Rider bid: J${selectedRide?.bidPrice}</Text>
            {bidsForRide.filter((b) => b.riderCounter && b.driverId === userProfile?.id).length > 0 && (
              <Text style={styles.riderCounterNote}>
                Rider countered: J${bidsForRide.find((b) => b.riderCounter && b.driverId === userProfile?.id)?.price}
              </Text>
            )}
            <TextInput
              style={styles.modalInput}
              placeholder="Your price (J$)"
              value={counterPrice}
              onChangeText={setCounterPrice}
              keyboardType="number-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSelectedRide(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSendBtn} onPress={handleSendCounter}>
                <Text style={styles.modalSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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
    padding: 16,
    backgroundColor: theme.colors.surface,
  },
  onlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
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
    marginBottom: 10,
  },
  countPill: {
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  countPillText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 10 },
  emptySub: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  rideListContent: { paddingBottom: 8 },
  card: {
    width: 280,
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  riderName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  route: { fontSize: 12, color: theme.colors.textSecondary, marginVertical: 4 },
  price: { fontSize: 18, fontWeight: 'bold', color: theme.colors.accent, marginBottom: 8 },
  coinsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.secondary + '18',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  coinsTagText: { flex: 1, fontSize: 11, fontWeight: '600', color: theme.colors.primary },
  foodStopBanner: {
    backgroundColor: theme.colors.orange + '25',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.orange,
  },
  foodStopText: { fontSize: 12, color: theme.colors.orange, fontWeight: '600' },
  markPickedUpBtn: {
    marginTop: 6,
    padding: 6,
    backgroundColor: theme.colors.green,
    borderRadius: 6,
    alignItems: 'center',
  },
  markPickedUpText: { fontSize: 11, color: theme.colors.white, fontWeight: 'bold' },
  actions: { flexDirection: 'row', gap: 4 },
  rejectBtn: { flex: 1, backgroundColor: theme.colors.error, padding: 6, borderRadius: 6, alignItems: 'center' },
  counterBtn: { flex: 1, backgroundColor: theme.colors.secondary, padding: 6, borderRadius: 6, alignItems: 'center' },
  acceptBtn: { flex: 1, backgroundColor: theme.colors.success, padding: 6, borderRadius: 6, alignItems: 'center' },
  btnText: { color: theme.colors.white, fontSize: 12, fontWeight: 'bold' },
  activeRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.success,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  popupBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  popupSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
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
  popupBadgeText: { color: theme.colors.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  popupRider: { fontSize: 22, fontWeight: '800', color: theme.colors.primary },
  popupPrice: { fontSize: 32, fontWeight: '800', color: theme.colors.accent, marginTop: 4 },
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
  popupFood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: theme.colors.orange + '15',
    borderRadius: 10,
  },
  popupFoodText: { flex: 1, fontSize: 13, color: theme.colors.orange, fontWeight: '600' },
  popupActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
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
  popupCounterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
  },
  popupCounterText: { fontWeight: '800', color: theme.colors.white, fontSize: 14 },
  popupAcceptBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
  },
  popupAcceptText: { fontWeight: '800', color: theme.colors.white, fontSize: 14 },
  activeRideText: { color: theme.colors.white, fontWeight: 'bold', fontSize: 14 },
  activeRideSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.white, padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  subscriptionModalText: { fontSize: 16, color: theme.colors.text, lineHeight: 24, marginBottom: 20 },
  modalSub: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  riderCounterNote: { fontSize: 13, color: theme.colors.primary, marginBottom: 12 },
  modalInput: { borderWidth: 2, borderColor: theme.colors.primaryLight, borderRadius: 12, padding: 14, fontSize: 18, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center' },
  modalCancelText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
  modalSendBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.success, alignItems: 'center' },
  modalSendText: { color: theme.colors.white, fontWeight: 'bold' },
});
