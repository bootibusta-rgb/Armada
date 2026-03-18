import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { getUserProfile } from '../../services/authService';
import { updateDriverLocation, cancelRide, notifyDriverApproaching } from '../../services/rideService';
import { analyticsEvents } from '../../services/analyticsService';
import { useTheme } from '../../context/ThemeContext';
import CancelRideModal from '../../components/CancelRideModal';
import { haversineKm } from '../../utils/haversine';

const PICKUP_COORDS = { lat: 18.0179, lng: -76.8099 };
const AVG_SPEED_KM_PER_MIN = 0.5;

export default function DriverActiveRideScreen({ route, navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const ride = route.params?.ride || {};
  const fare = ride.finalFare || ride.bidPrice || 0;
  const isCompleted = ride.status === 'completed';
  const [loc, setLoc] = useState(null);
  const [riderPhone, setRiderPhone] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const subRef = useRef(null);
  const approachingNotifiedRef = useRef(false);

  useEffect(() => {
    if (ride.riderId) {
      getUserProfile(ride.riderId).then((p) => setRiderPhone(p?.phone || null));
    }
  }, [ride.riderId]);

  useEffect(() => {
    if (!userProfile?.id || isCompleted) return;
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 50 },
          (pos) => {
            if (!active) return;
            const { latitude, longitude } = pos.coords;
            setLoc({ latitude, longitude });
            updateDriverLocation(userProfile.id, { latitude, longitude });
            if (!approachingNotifiedRef.current && ride?.id) {
              const km = haversineKm(PICKUP_COORDS.lat, PICKUP_COORDS.lng, latitude, longitude);
              const etaMins = km / AVG_SPEED_KM_PER_MIN;
              if (etaMins >= 1 && etaMins <= 5) {
                approachingNotifiedRef.current = true;
                notifyDriverApproaching(ride.id, Math.round(etaMins)).catch(() => {});
              }
            }
          }
        );
        subRef.current = sub;
      } catch (e) {}
    })();
    return () => {
      active = false;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [userProfile?.id, isCompleted, ride?.id]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.riderName}>{ride.riderName || 'Rider'}</Text>
        <Text style={styles.route}>{ride.pickup || 'Pickup'} → {ride.dropoff || 'Dropoff'}</Text>
        <Text style={styles.fare}>J${fare}</Text>
        <View style={styles.contactRow}>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => {
              if (riderPhone) {
                Linking.openURL(`tel:${riderPhone.replace(/\D/g, '')}`);
              } else {
                Alert.alert('No phone', 'Rider has not shared a phone number. Use in-app chat.');
              }
            }}
          >
            <Ionicons name="call" size={22} color={theme.colors.onPrimary} />
            <Text style={styles.contactText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() =>
              navigation.navigate('RideChat', {
                rideId: ride.id,
                otherName: ride.riderName || 'Rider',
              })
            }
          >
            <Ionicons name="chatbubble" size={22} color={theme.colors.onPrimary} />
            <Text style={styles.contactText}>Message</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.status}>
          {isCompleted ? 'Ride complete – payment received' : 'Waiting for rider to complete payment'}
        </Text>
        {!isCompleted && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCancelModal(true)}>
            <Text style={styles.cancelBtnText}>Cancel ride</Text>
          </TouchableOpacity>
        )}
      </View>
      <CancelRideModal
        visible={showCancelModal}
        onCancel={() => setShowCancelModal(false)}
        onConfirm={async (reason) => {
          setShowCancelModal(false);
          try {
            await cancelRide(ride.id, reason, 'driver');
            analyticsEvents.rideCancelled(ride.id, reason, 'driver');
            Alert.alert('Cancelled', 'Ride cancelled');
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not cancel');
          }
        }}
        isDriver={true}
      />
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24, justifyContent: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  riderName: { fontSize: 22, fontWeight: 'bold', color: theme.colors.primary },
  route: { fontSize: 16, color: theme.colors.textSecondary, marginTop: 8 },
  fare: { fontSize: 28, fontWeight: 'bold', color: theme.colors.accent, marginTop: 12 },
  contactRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 8,
  },
  contactText: { color: theme.colors.onPrimary, fontSize: 14, fontWeight: '600' },
  status: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 16 },
  cancelBtn: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: theme.colors.error + '30', alignItems: 'center' },
  cancelBtnText: { color: theme.colors.error, fontWeight: 'bold', fontSize: 14 },
});
