import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { subscribeToBids, addBid, updateRide, cancelRide } from '../../services/rideService';
import { addFavouriteDriver, removeFavouriteDriver, getFavouriteDrivers, isFavourite } from '../../services/favouriteDriversService';
import { analyticsEvents } from '../../services/analyticsService';
import { useTheme } from '../../context/ThemeContext';
import CancelRideModal from '../../components/CancelRideModal';

const DEMO_DRIVERS = [
  { id: 'd1', name: 'Marcus', rating: 4.9, counterPrice: 1800 },
  { id: 'd2', name: 'Shanice', rating: 4.7, counterPrice: 1600 },
  { id: 'd3', name: 'Devon', rating: 4.8, counterPrice: 1700 },
];

export default function BiddingScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { rideId, bidPrice, demo, useRedeem, pickup, dropoff } = route.params || {};
  const { userProfile } = useAuth();
  const styles = createStyles(theme);
  const [bids, setBids] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [counterOffers, setCounterOffers] = useState({});
  const [favourites, setFavourites] = useState(new Set());
  const [drivers] = useState(demo ? DEMO_DRIVERS : []);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (userProfile?.id) getFavouriteDrivers(userProfile.id).then((list) => setFavourites(new Set((list || []).map((d) => d.id)))).catch(() => {});
  }, [userProfile?.id]);

  useEffect(() => {
    if (demo || !rideId) return () => {};
    const unsub = subscribeToBids(rideId, setBids);
    return unsub;
  }, [rideId, demo]);

  const getFareForDriver = (driver) => {
    const counter = counterOffers[driver.id]?.trim();
    const counterNum = counter ? parseInt(counter, 10) : NaN;
    if (!isNaN(counterNum) && counterNum > 0) return counterNum;
    if (driver.riderCounterPrice) return driver.riderCounterPrice;
    return driver.counterPrice || driver.price || bidPrice;
  };

  const acceptBid = (driver) => {
    setSelectedDriver(driver);
    const fare = getFareForDriver(driver);
    const isCounter = fare !== (driver.counterPrice || driver.price || bidPrice);
    Alert.alert(
      'Accept Bid',
      isCounter ? `Accept at your counter of J$${fare}?` : `Accept ${driver.name}'s offer of J$${fare}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => {
            if (demo) {
              navigation.navigate('ActiveRide', {
                rideId: rideId || 'demo-ride-1',
                driver: driver,
                fare,
                useRedeem,
                pickup,
                dropoff,
                demo: true,
              });
            } else if (rideId) {
              updateRide(rideId, {
                status: 'accepted',
                driverId: driver.id,
                driverName: driver.name,
                finalFare: fare,
              }).then(() => {
                analyticsEvents.rideAccepted(rideId, driver.id, fare);
                navigation.navigate('ActiveRide', { rideId, driver, fare, useRedeem, pickup, dropoff });
              }).catch((e) => Alert.alert('Error', e.message || 'Could not accept bid'));
            } else {
              Alert.alert('Error', 'Ride not found');
            }
          },
        },
      ]
    );
  };

  // Dedupe by driver: driver bids + rider counters. Keep driver bid as base, attach rider counter if sent.
  const displayDrivers = demo ? DEMO_DRIVERS : (() => {
    if (!bids.length) return [];
    const driverBids = bids.filter((b) => !b.riderCounter);
    const riderCounters = bids.filter((b) => b.riderCounter);
    return driverBids.map((b) => {
      const rc = riderCounters.find((r) => r.driverId === b.driverId);
      const driverKey = b.driverId || b.id;
      return { ...b, id: driverKey, name: b.driverName, riderCounterPrice: rc?.price };
    });
  })();

  const showEmptyState = !demo && bids.length === 0;

  const sendCounter = (driver) => {
    const counter = counterOffers[driver.id]?.trim();
    const counterNum = counter ? parseInt(counter, 10) : NaN;
    if (isNaN(counterNum) || counterNum < 1) {
      Alert.alert('Invalid', 'Enter a valid counter offer (J$)');
      return;
    }
    if (demo) {
      Alert.alert('Counter sent', `Your offer of J$${counterNum} sent to ${driver.name}`);
      setCounterOffers((prev) => ({ ...prev, [driver.id]: '' }));
      return;
    }
    if (!rideId) {
      Alert.alert('Error', 'Ride not found');
      return;
    }
    addBid(rideId, {
      riderCounter: true,
      driverId: driver.id,
      driverName: driver.name,
      price: counterNum,
      riderId: userProfile?.id,
    }).then(() => {
      Alert.alert('Counter sent', `Your offer of J$${counterNum} sent to ${driver.name}`);
      setCounterOffers((prev) => ({ ...prev, [driver.id]: '' }));
    }).catch((e) => Alert.alert('Error', e.message || 'Could not send counter'));
  };

  const handleCancelRide = (reason) => {
    setShowCancelModal(false);
    if (demo) {
      Alert.alert('Cancelled', 'Ride request cancelled');
      navigation.goBack();
      return;
    }
    if (!rideId) {
      Alert.alert('Error', 'Ride not found');
      navigation.goBack();
      return;
    }
    cancelRide(rideId, reason, 'rider')
      .then(() => {
        analyticsEvents.rideCancelled(rideId, reason, 'rider');
        Alert.alert('Cancelled', 'Ride request cancelled');
        navigation.goBack();
      })
      .catch((e) => Alert.alert('Error', e.message || 'Could not cancel'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Nearby drivers – bid back & forth</Text>
        <TouchableOpacity onPress={() => setShowCancelModal(true)} style={styles.cancelRideBtn}>
          <Text style={styles.cancelRideText}>Cancel ride</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Your bid: J${bidPrice}</Text>
      {displayDrivers.length > 0 && (
        <View style={styles.etaBanner}>
          <Ionicons name="time" size={18} color={theme.colors.primary} />
          <Text style={styles.etaText}>Est. pickup: ~5–8 min</Text>
        </View>
      )}
      {showEmptyState && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Waiting for driver bids…</Text>
          <Text style={styles.emptySub}>Drivers nearby will see your ride and can counter or accept.</Text>
        </View>
      )}
      <FlatList
        data={displayDrivers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.driverName}>{item.name}</Text>
              <View style={styles.cardHeaderRight}>
                {((item.rating || 4.8) >= 4.8 || item.idVerified) && (
                  <View style={styles.badges}>
                    {item.idVerified && <Text style={styles.badge}>✓ ID</Text>}
                    {(item.rating || 4.8) >= 4.8 && <Text style={styles.badge}>★ Top</Text>}
                  </View>
                )}
                <Text style={styles.rating}>⭐ {item.rating || 4.8}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    if (demo) return;
                    const fav = favourites.has(item.id);
                    if (fav) {
                      await removeFavouriteDriver(userProfile?.id, item.id);
                      setFavourites((s) => { const n = new Set(s); n.delete(item.id); return n; });
                    } else {
                      await addFavouriteDriver(userProfile?.id, item);
                      setFavourites((s) => new Set([...s, item.id]));
                    }
                  }}
                >
                  <Ionicons name={favourites.has(item.id) ? 'heart' : 'heart-outline'} size={22} color={favourites.has(item.id) ? theme.colors.error : theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.price}>J${item.counterPrice || item.price || bidPrice + 200}</Text>
              {(counterOffers[item.id]?.trim() || item.riderCounterPrice) && (
                <Text style={styles.counterLabel}>
                  Your counter: J${counterOffers[item.id]?.trim() ? (parseInt(counterOffers[item.id], 10) || counterOffers[item.id]) : item.riderCounterPrice}
                </Text>
              )}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => Alert.alert('Rejected', 'Bid rejected')}>
                <Ionicons name="close" size={20} color={theme.colors.onPrimary} />
              </TouchableOpacity>
              <TextInput
                style={styles.counterInput}
                placeholder="Your counter (J$)"
                value={counterOffers[item.id] || ''}
                onChangeText={(v) => setCounterOffers((prev) => ({ ...prev, [item.id]: v }))}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[styles.counterBtn, !counterOffers[item.id]?.trim() && styles.counterBtnDisabled]}
                onPress={() => sendCounter(item)}
                disabled={!counterOffers[item.id]?.trim()}
              >
                <Text style={styles.counterBtnText}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptBid(item)}>
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      <CancelRideModal
        visible={showCancelModal}
        onCancel={() => setShowCancelModal(false)}
        onConfirm={handleCancelRide}
        isDriver={false}
      />
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, flex: 1 },
  cancelRideBtn: { paddingVertical: 4, paddingHorizontal: 12 },
  cancelRideText: { fontSize: 14, color: theme.colors.error, fontWeight: '600' },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary + '15',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  etaText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { fontSize: 10, color: theme.colors.success, backgroundColor: theme.colors.success + '30', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  driverName: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  rating: { fontSize: 14, color: theme.colors.textSecondary },
  priceRow: { marginBottom: 12 },
  price: { fontSize: 24, fontWeight: 'bold', color: theme.colors.accent },
  counterLabel: { fontSize: 14, color: theme.colors.primary, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rejectBtn: { backgroundColor: theme.colors.error, padding: 10, borderRadius: 8 },
  counterInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  counterBtn: { backgroundColor: theme.colors.primary, padding: 10, borderRadius: 8 },
  counterBtnDisabled: { opacity: 0.5 },
  counterBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 14 },
  acceptBtn: { backgroundColor: theme.colors.success, padding: 12, borderRadius: 8 },
  acceptText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
  emptyState: {
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
});
