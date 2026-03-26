import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isFirebaseReady } from '../../config/firebase';
import { updateUserProfile } from '../../services/authService';
import {
  subscribeCarRentalRequestsForOwner,
  isCarRentalListingSubscriptionActive,
} from '../../services/carRentalService';
import { CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD } from '../../config/carRentalPricing';
import { withSectionGuide } from '../../components/withSectionGuide';

const STATUS_LABEL = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  completed: 'Completed',
  unavailable: 'Unavailable',
};

function CarRentalDashboardScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile, user, refreshUserProfile } = useAuth();
  const ownerId = userProfile?.id;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const available = userProfile?.rentalAvailable !== false;
  const listingPaid = isCarRentalListingSubscriptionActive(userProfile);
  const idOk = userProfile?.idVerified === true;

  useEffect(() => {
    if (!isFirebaseReady || !ownerId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const unsub = subscribeCarRentalRequestsForOwner(ownerId, (rows) => {
      setRequests(rows);
      setLoading(false);
    });
    return unsub;
  }, [ownerId]);

  const toggleAvailable = async (value) => {
    if (!isFirebaseReady || !user?.uid) {
      Alert.alert('Unavailable', 'Connect Firebase to update availability.');
      return;
    }
    try {
      await updateUserProfile(user.uid, { rentalAvailable: value });
      await refreshUserProfile();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update');
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('CarRentalRequestOwner', { requestId: item.id })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <Text style={styles.riderName}>{item.riderName || 'Rider'}</Text>
        <Text style={styles.chev}>›</Text>
      </View>
      <Text style={styles.cardLine} numberOfLines={1}>
        {item.vehicleDisplayName || item.licensePlate} • J${item.dailyRate}/day
      </Text>
      {item.riderPickupSpot ? (
        <Text style={styles.cardPickup} numberOfLines={2}>
          Pickup: {item.riderPickupSpot}
        </Text>
      ) : null}
      {item.riderTimeLabel ? <Text style={styles.cardLine}>Time: {item.riderTimeLabel}</Text> : null}
      <Text style={[styles.status, { color: theme.colors.primary }]}>
        {STATUS_LABEL[item.status] || item.status}
      </Text>
      <Text style={styles.tapHint}>Tap for Call, Text, Suggest, Accept…</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sub}>Requests from riders and your availability</Text>

      {(!idOk || !listingPaid) && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Listing status</Text>
          {!idOk ? (
            <Text style={styles.noticeLine}>• Complete ID verification (signup) so we can verify your account.</Text>
          ) : null}
          {!listingPaid ? (
            <Text style={styles.noticeLine}>
              • Pay J${CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD.toLocaleString()}/vehicle/week on the{' '}
              <Text style={styles.noticeBold}>Listing fee</Text> tab to appear in Rent a Car.
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.availRow}>
        <Text style={styles.availLabel}>Available for rentals</Text>
        <Switch value={available} onValueChange={toggleAvailable} trackColor={{ false: '#ccc', true: theme.colors.success + '80' }} />
      </View>

      <Text style={styles.sectionTitle}>Requests</Text>
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No requests yet.</Text>}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

export default withSectionGuide(CarRentalDashboardScreen, 'car_rental_home');

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
    sub: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
    notice: {
      backgroundColor: theme.colors.accent + '22',
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.colors.primaryLight,
    },
    noticeTitle: { fontWeight: '800', color: theme.colors.primary, marginBottom: 6 },
    noticeLine: { fontSize: 13, color: theme.colors.text, marginTop: 4, lineHeight: 18 },
    noticeBold: { fontWeight: '800', color: theme.colors.primary },
    availRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      marginBottom: 20,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
    },
    availLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 10 },
    list: { paddingBottom: 40 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    riderName: { fontSize: 17, fontWeight: 'bold', color: theme.colors.primary, flex: 1 },
    chev: { fontSize: 22, color: theme.colors.textSecondary, fontWeight: '300' },
    cardLine: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
    cardPickup: { fontSize: 13, color: theme.colors.text, marginTop: 6, fontWeight: '600' },
    status: { fontSize: 14, fontWeight: '700', marginTop: 8 },
    tapHint: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 24 },
  });
