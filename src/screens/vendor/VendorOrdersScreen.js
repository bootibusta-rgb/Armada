import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToFoodOrdersByVendor, updateFoodOrderStatus } from '../../services/foodOrderService';
import { subscribeToRide, subscribeToDriverLocation } from '../../services/rideService';
import { haversineKm } from '../../utils/haversine';
import { isFirebaseReady } from '../../config/firebase';

export default function VendorOrdersScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const vendorId = userProfile?.vendorId || 'jerkman';
  const vendorLat = userProfile?.lat ?? 18.007;
  const vendorLng = userProfile?.lng ?? -76.782;

  const [orders, setOrders] = useState([]);
  const [orderDetails, setOrderDetails] = useState({});
  const [driverDistances, setDriverDistances] = useState({});
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    if (!isFirebaseReady) return;
    const unsub = subscribeToFoodOrdersByVendor(vendorId, (firebaseOrders) => {
      setOrders(firebaseOrders);
    });
    return unsub;
  }, [vendorId]);

  useEffect(() => {
    if (!isFirebaseReady) return;
    const unsubs = [];
    orders.forEach((order) => {
      if (order.status === 'picked-up') return;
      const rideUnsub = subscribeToRide(order.rideId, (ride) => {
        setOrderDetails((prev) => ({ ...prev, [order.id]: ride }));
        if (ride?.driverId) {
          const locUnsub = subscribeToDriverLocation(ride.driverId, (loc) => {
            if (loc?.latitude != null && loc?.longitude != null) {
              const km = haversineKm(vendorLat, vendorLng, loc.latitude, loc.longitude);
              const etaMin = Math.ceil((km / 30) * 60);
              setDriverDistances((prev) => ({
                ...prev,
                [order.id]: { km: km.toFixed(1), eta: etaMin },
              }));
            }
          });
          unsubs.push(locUnsub);
        }
      });
      if (rideUnsub) unsubs.push(rideUnsub);
    });
    return () => unsubs.forEach((u) => u?.());
  }, [orders, vendorLat, vendorLng]);

  const handleMarkPickedUp = async (order) => {
    if (order.status === 'picked-up') return;
    setMarkingId(order.id);
    try {
      if (isFirebaseReady) {
        await updateFoodOrderStatus(order.id, 'picked-up');
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: 'picked-up' } : o))
        );
        Alert.alert('Done', 'Order marked as picked up');
      } else {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: 'picked-up' } : o))
        );
        Alert.alert('Demo', 'Order marked as picked up');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update');
    } finally {
      setMarkingId(null);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'picked-up') return theme.colors.success;
    return theme.colors.accent;
  };

  const getDistanceText = (order) => {
    if (order.status === 'picked-up') return null;
    const dist = driverDistances[order.id];
    if (dist) return `${dist.km} km away • ~${dist.eta} min`;
    const ride = orderDetails[order.id];
    if (ride?.driverId) return 'En route...';
    return 'Waiting for driver';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      <Text style={styles.subtitle}>Food stop orders for {userProfile?.name || 'your spot'}</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.rideId}>Ride #{item.rideId}</Text>
            <Text style={styles.items}>{item.items?.join(', ') || '—'}</Text>
            {(item.itemsTotal > 0 || item.extraFee > 0) && (
              <Text style={styles.orderTotal}>
                J${item.itemsTotal || 0} items + J${item.extraFee || 0} detour
              </Text>
            )}
            {orderDetails[item.id]?.riderName && (
              <Text style={styles.rider}>
                Ordered by: {orderDetails[item.id].riderName}
              </Text>
            )}
            {getDistanceText(item) && (
              <View style={styles.distanceRow}>
                <Ionicons name="navigate" size={16} color={theme.colors.accent} />
                <Text style={styles.distance}>{getDistanceText(item)}</Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={[styles.status, { color: getStatusColor(item.status) }]}>
                {item.status === 'picked-up' ? '✓ Picked up' : 'Pending'}
              </Text>
              <Text style={styles.fee}>+ J${item.extraFee} detour</Text>
            </View>
            {item.status !== 'picked-up' && (
              <TouchableOpacity
                style={[styles.pickupBtn, markingId === item.id && styles.pickupBtnDisabled]}
                onPress={() => handleMarkPickedUp(item)}
                disabled={markingId !== null}
              >
                <Ionicons name="checkmark-circle" size={20} color={theme.colors.onPrimary} />
                <Text style={styles.pickupBtnText}>
                  {markingId === item.id ? 'Updating...' : 'Mark Picked Up'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  rideId: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  items: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  orderTotal: { fontSize: 12, color: theme.colors.accent, marginTop: 4, fontWeight: '600' },
  rider: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  distanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  distance: { fontSize: 13, color: theme.colors.accent, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  status: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  fee: { fontSize: 12, color: theme.colors.accent },
  pickupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.green,
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  pickupBtnDisabled: { opacity: 0.6 },
  pickupBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
});
