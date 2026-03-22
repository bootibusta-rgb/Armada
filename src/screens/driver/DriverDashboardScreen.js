import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { useTheme } from '../../context/ThemeContext';
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

const SUBSCRIPTION_INFO_KEY = 'armada_driver_subscription_info_seen';

export default function DriverDashboardScreen({ navigation }) {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [rides, setRides] = useState([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [selectedRide, setSelectedRide] = useState(null);
  const [bidsForRide, setBidsForRide] = useState([]);
  const [counterPrice, setCounterPrice] = useState('');
  const [goOfflineCountdown, setGoOfflineCountdown] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const goOfflineTimerRef = useRef(null);
  const autoOfflineRef = useRef(null);

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
        }))
      );
    });
    return unsub;
  }, []);

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
        <Text style={styles.title}>Incoming bids</Text>
        <FlatList
          data={rides}
          horizontal
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.riderName}>{item.riderName}</Text>
              <Text style={styles.route}>
                {[item.pickup, ...(item.stops || []), item.dropoff].filter(Boolean).join(' → ')}
              </Text>
              <Text style={styles.price}>J${item.bidPrice}</Text>
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
            onPress={() => navigation.getRootParent?.()?.navigate('DriverActiveRide', { ride: activeRide })}
          >
            <Text style={styles.activeRideText}>Active ride: {activeRide.riderName || 'Rider'} → J${activeRide.finalFare || activeRide.bidPrice}</Text>
            <Text style={styles.activeRideSub}>Tap to view</Text>
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
  title: { fontSize: 16, color: theme.colors.textSecondary, marginBottom: 8 },
  card: {
    width: 200,
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
    backgroundColor: theme.colors.success,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
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
