import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { isFavourite } from '../../services/favouriteDriversService';
import { getRideById } from '../../services/rideService';

export default function RideReceiptScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const { rideId, pickup, dropoff, fare, driver, completedAt, paymentMethod, fromNotification } = route.params || {};
  const [driverIsFav, setDriverIsFav] = React.useState(false);
  const [loading, setLoading] = React.useState(!!(fromNotification && rideId));
  const [rideData, setRideData] = React.useState(null);
  const resolved = rideData || { pickup, dropoff, fare, driver, completedAt, paymentMethod };
  const date = (resolved.completedAt || resolved.cancelledAt) ? new Date(resolved.completedAt || resolved.cancelledAt) : new Date();
  const styles = createStyles(theme);

  React.useEffect(() => {
    if (fromNotification && rideId) {
      getRideById(rideId).then((r) => {
        setRideData(r);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [fromNotification, rideId]);

  React.useEffect(() => {
    if (userProfile?.id && (driver?.id || resolved.driver?.id)) {
      isFavourite(userProfile.id, driver?.id || resolved.driver?.id).then(setDriverIsFav);
    }
  }, [userProfile?.id, driver?.id, resolved.driver?.id]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const handleShare = async () => {
    try {
      const p = resolved.pickup || pickup || '—';
      const d = resolved.dropoff || dropoff || '—';
      const f = resolved.fare ?? fare ?? 0;
      const dr = resolved.driver || driver;
      const msg = `Armada Ride Receipt\n${date.toLocaleDateString()} • J$${f}\n${p} → ${d}\nDriver: ${dr?.name || '—'}`;
      await Share.share({ message: msg, title: 'Armada Ride Receipt' });
    } catch (e) {}
  };

  const isCancelled = rideData?.status === 'cancelled';
  const d = resolved.driver || driver;
  const p = resolved.pickup || pickup;
  const drop = resolved.dropoff || dropoff;
  const f = resolved.fare ?? fare;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name={isCancelled ? 'close-circle' : 'receipt'} size={48} color={isCancelled ? theme.colors.error : theme.colors.primary} />
        <Text style={styles.title}>{isCancelled ? 'Ride Cancelled' : 'Ride Receipt'}</Text>
        {isCancelled && (
          <Text style={[styles.date, { color: theme.colors.success, fontWeight: '600' }]}>Refund issued</Text>
        )}
        <Text style={styles.date}>{date.toLocaleDateString('en-JM', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
      </View>
      <View style={styles.card}>
        <Row label="Pickup" value={p || '—'} styles={styles} />
        <Row label="Dropoff" value={drop || '—'} styles={styles} />
        <Row label="Driver" value={d?.name || '—'} styles={styles} />
        <Row label="Fare" value={`J$${(f ?? 0).toLocaleString()}`} styles={styles} />
        <Row label="Payment" value={(resolved.paymentMethod ?? paymentMethod) === 'card' ? 'Card (PayPal)' : 'Cash'} styles={styles} />
        {rideData?.cancellationReason && <Row label="Reason" value={rideData.cancellationReason} styles={styles} />}
        {rideId && <Row label="Ride ID" value={rideId.slice(0, 12) + '…'} styles={styles} />}
      </View>
      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Ionicons name="share-social" size={22} color={theme.colors.onPrimary} />
        <Text style={styles.shareText}>Share receipt</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rebookBtn}
        onPress={() =>
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'RiderHome',
                params: {
                  rebookPickup: p || 'Kingston, Jamaica',
                  rebookDropoff: drop || 'Montego Bay, Jamaica',
                  rebookDriver: driverIsFav && d ? d : null,
                },
              },
            ],
          })
        }
      >
        <Ionicons name="refresh" size={22} color={theme.colors.onPrimary} />
        <Text style={styles.rebookText}>Book same route again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, styles }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginTop: 12 },
  date: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.background },
  rowLabel: { fontSize: 14, color: theme.colors.textSecondary },
  rowValue: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  shareText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  rebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.success,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  rebookText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  backBtn: { padding: 16, alignItems: 'center' },
  backText: { color: theme.colors.textSecondary, fontSize: 16 },
});
