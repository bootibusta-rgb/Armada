import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  Linking,
  ActionSheetIOS,
  Platform,
  Switch,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToDriverLocation, cancelRide, updateRide } from '../../services/rideService';
import { isFirebaseReady } from '../../config/firebase';
import { REDEEM_DISCOUNT, canApplyCoinRedemption, getRedemptionSummary } from '../../services/iriCoinsService';
import { DEFAULT_RIDER_COINS_FALLBACK } from '../../constants/armadaCoins';
import { analyticsEvents } from '../../services/analyticsService';
import CancelRideModal from '../../components/CancelRideModal';
import { haversineKm } from '../../utils/haversine';
import { getEmergencyContacts } from '../../services/emergencyContactsService';
import {
  sendEmergencyToAppUser,
  sendEmergencyToPhone,
  startEmergencyCall,
  getCurrentLocation,
  speakEmergencyMessage,
} from '../../services/emergencyService';

const SOS_MESSAGE = 'Emergency - I need help on Armada ride. Track me: https://maps.google.com/?q=18.0179,-76.8099';

const PICKUP_COORDS = { lat: 18.0179, lng: -76.8099 };
const AVG_SPEED_KM_PER_MIN = 0.5;

function formatEta(seconds) {
  if (seconds <= 0) return 'Arriving now';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `Arriving in ${m}:${s.toString().padStart(2, '0')}`;
}

export default function ActiveRideScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { driver, fare, demo, rideId, pickup, dropoff } = route.params || {};
  const { userProfile } = useAuth();
  const coins = userProfile?.irieCoins ?? DEFAULT_RIDER_COINS_FALLBACK;
  const redemption = getRedemptionSummary(userProfile || {});
  const canRedeemCoins = canApplyCoinRedemption(userProfile, coins);
  const [applyCoinsAtPayment, setApplyCoinsAtPayment] = useState(() => !!route.params?.useRedeem);

  useEffect(() => {
    if (canRedeemCoins) return;
    setApplyCoinsAtPayment((prev) => {
      if (prev && rideId && !demo && isFirebaseReady) {
        updateRide(rideId, { useRedeem: false }).catch(() => {});
      }
      return false;
    });
  }, [canRedeemCoins, rideId, demo]);
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [location, setLocation] = useState(null);
  const [driverPhone, setDriverPhone] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const countdownRef = useRef(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (driver?.id && !demo) {
      getUserProfile(driver.id).then((p) => {
        setDriverProfile(p);
        setDriverPhone(p?.phone || null);
      });
    }
  }, [driver?.id, demo]);

  const region = {
    latitude: location?.latitude ?? 18.0179,
    longitude: location?.longitude ?? -76.8099,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  useEffect(() => {
    getCurrentLocation().then(setLocation);
  }, []);

  // Live driver ETA from GPS (Firebase Realtime) – fallback to ~12 min if no location yet
  useEffect(() => {
    if (demo || !driver?.id) {
      setEtaSeconds(12 * 60);
      return;
    }
    const fallback = setTimeout(() => {
      setEtaSeconds((s) => (s === null ? 12 * 60 : s));
    }, 3000);
    const unsub = subscribeToDriverLocation(driver.id, (loc) => {
      if (!loc?.latitude || !loc?.longitude) return;
      const km = haversineKm(PICKUP_COORDS.lat, PICKUP_COORDS.lng, loc.latitude, loc.longitude);
      const mins = km / AVG_SPEED_KM_PER_MIN;
      const secs = Math.max(0, Math.round(mins * 60));
      setEtaSeconds(secs);
    });
    return () => {
      clearTimeout(fallback);
      unsub();
    };
  }, [driver?.id, demo]);

  // Countdown timer for ETA
  useEffect(() => {
    if (etaSeconds === null || etaSeconds <= 0) return;
    countdownRef.current = setInterval(() => {
      setEtaSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [etaSeconds]);

  const handleShareLocation = async () => {
    setSharing(true);
    try {
      const loc = location || { latitude: 18.0179, longitude: -76.8099 };
      const rideLink = rideId ? `\nRide: armada://ride/${rideId}` : '';
      await Share.share({
        message: `I'm on an Armada ride! Track me: https://maps.google.com/?q=${loc.latitude},${loc.longitude}${rideLink}`,
        title: 'Armada - Live Location',
      });
    } catch (e) {}
    setSharing(false);
  };

  const handleEmergency = async () => {
    const contacts = await getEmergencyContacts(userProfile?.id);
    const validContacts = contacts.filter((c) => c.phone?.trim());
    if (validContacts.length === 0) {
      Alert.alert(
        'No emergency contacts',
        'Add emergency contacts in the Emergency tab first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Emergency', onPress: () => navigation.getParent()?.navigate('Safety') },
        ]
      );
      return;
    }

    const loc = location || await getCurrentLocation();

    // Prefer app users (with uid) - they get Firestore signal + can answer in app
    const appUsers = validContacts.filter((c) => c.uid);
    const contactToUse = appUsers[0] || validContacts[0];
    const isAppUser = !!appUsers[0];

    if (isAppUser) {
      try {
        const callId = await sendEmergencyToAppUser(contactToUse, userProfile, loc);
        navigation.navigate('EmergencyCall', {
          callId,
          contact: contactToUse,
          fromUser: userProfile,
          location: loc,
        });
      } catch (e) {
        sendEmergencyToPhone(contactToUse, loc);
        startEmergencyCall(contactToUse);
      }
    } else {
      speakEmergencyMessage('Emergency. I need help on my Armada ride.');
      if (Platform.OS === 'ios' && validContacts.length > 0) {
        const options = [
          'Cancel',
          ...validContacts.flatMap((c) => [
            `Call ${c.name || c.phone}`,
            `Text ${c.name || c.phone}`,
          ]),
        ];
        ActionSheetIOS.showActionSheetWithOptions(
          { title: 'Emergency', options, cancelButtonIndex: 0 },
          (i) => {
            if (i === 0) return;
            const contactIdx = Math.floor((i - 1) / 2);
            const isText = (i - 1) % 2 === 1;
            const c = validContacts[contactIdx];
            if (isText) {
              const msg = `Emergency - I need help on Armada ride. Track me: https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
              Linking.openURL(`sms:${c.phone}?body=${encodeURIComponent(msg)}`);
            } else {
              Linking.openURL(`tel:${c.phone}`);
            }
          }
        );
      } else {
        const buttons = [
          { text: 'Cancel', style: 'cancel' },
          ...validContacts.flatMap((c) => [
            { text: `Call ${c.name || c.phone}`, onPress: () => Linking.openURL(`tel:${c.phone}`) },
            {
              text: `Text ${c.name || c.phone}`,
              onPress: () => {
                const msg = `Emergency - I need help on Armada ride. Track me: https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
                Linking.openURL(`sms:${c.phone}?body=${encodeURIComponent(msg)}`);
              },
            },
          ]),
        ];
        Alert.alert('Emergency', 'Choose a contact to call or text:', buttons);
      }
    }
  };

  const syncRideUseRedeem = useCallback(
    async (value) => {
      if (demo || !rideId || !isFirebaseReady) return;
      try {
        await updateRide(rideId, { useRedeem: value });
      } catch (e) {
        Alert.alert('Could not update ride', e?.message || 'Try again.');
      }
    },
    [demo, rideId]
  );

  const onToggleCoinsForPayment = (value) => {
    if (value && !canRedeemCoins) {
      Alert.alert(
        'Cannot apply coins',
        coins < 100
          ? 'You need at least 100 Armada Coins.'
          : `You’ve used all ${redemption.limit} redemptions this month.`
      );
      return;
    }
    setApplyCoinsAtPayment(value);
    syncRideUseRedeem(value);
  };

  const styles = createStyles(theme);

  const handleComplete = () => {
    const useRedeemAtPayment = applyCoinsAtPayment && canRedeemCoins;
    navigation.navigate('Payment', {
      rideId: route.params?.rideId || 'demo-ride-1',
      fare: fare || 1500,
      driver,
      demo,
      useRedeem: useRedeemAtPayment,
      pickup: route.params?.pickup,
      dropoff: route.params?.dropoff,
    });
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} initialRegion={region}>
        <Marker
          coordinate={{ latitude: region.latitude, longitude: region.longitude }}
          title="You"
          pinColor="green"
        />
        <Marker
          coordinate={{ latitude: region.latitude + 0.0006, longitude: region.longitude + 0.0006 }}
          title={driver?.name || 'Driver'}
          pinColor="blue"
        />
      </MapView>

      <TouchableOpacity style={styles.emergencyFloating} onPress={handleEmergency}>
        <Ionicons name="alert-circle" size={28} color={theme.colors.onPrimary} />
        <Text style={styles.emergencyText}>Emergency</Text>
      </TouchableOpacity>

      <View style={styles.overlay}>
        <View style={styles.etaCard}>
          <Text style={styles.etaLabel}>ETA</Text>
          <Text style={styles.etaValue}>
            {etaSeconds !== null ? formatEta(etaSeconds) : 'Calculating…'}
          </Text>
        </View>
        <View style={styles.driverCard}>
          <Text style={styles.driverName}>{driver?.name || 'Driver'}</Text>
          <Text style={styles.fare}>J${fare || 1500}</Text>
          <View style={styles.coinsSection}>
            <Text style={styles.coinsSectionTitle}>Armada Coins (this ride)</Text>
            <Text style={styles.coinsSectionMeta}>
              Turn on to use 100 coins for J${REDEEM_DISCOUNT} off when you pay. Redemptions: {redemption.remaining} of{' '}
              {redemption.limit} left this month. Your driver gets a notification so they know the fare is reduced.
            </Text>
            <View style={styles.coinsSwitchRow}>
              <Text style={styles.coinsSwitchLabel}>Apply 100 coins at payment</Text>
              <Switch
                value={applyCoinsAtPayment && canRedeemCoins}
                onValueChange={onToggleCoinsForPayment}
                disabled={!canRedeemCoins}
                trackColor={{ false: theme.colors.textSecondary + '55', true: theme.colors.primary + '99' }}
                thumbColor={applyCoinsAtPayment && canRedeemCoins ? theme.colors.primary : theme.colors.surface}
              />
            </View>
            {!canRedeemCoins && (
              <Text style={styles.coinsSectionHint}>
                {coins < 100
                  ? 'Earn more coins from rides (1 per J$100 spent) to unlock this option.'
                  : 'Monthly redemption limit reached — try again next month.'}
              </Text>
            )}
          </View>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => {
                if (driverPhone) {
                  Linking.openURL(`tel:${driverPhone.replace(/\D/g, '')}`);
                } else {
                  Alert.alert('No phone', 'Driver has not shared a phone number. Use in-app chat.');
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
                  rideId: rideId || 'demo-ride-1',
                  otherName: driver?.name || 'Driver',
                })
              }
            >
              <Ionicons name="chatbubble" size={22} color={theme.colors.onPrimary} />
              <Text style={styles.contactText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShareLocation}>
            <Ionicons name="share-social" size={24} color={theme.colors.onPrimary} />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelRideBtn} onPress={() => setShowCancelModal(true)}>
            <Text style={styles.cancelRideText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
            <Text style={styles.completeText}>Complete Ride</Text>
          </TouchableOpacity>
        </View>
      </View>
      <CancelRideModal
        visible={showCancelModal}
        onCancel={() => setShowCancelModal(false)}
        onConfirm={async (reason) => {
          setShowCancelModal(false);
          if (demo) {
            Alert.alert('Cancelled', 'Ride cancelled');
            navigation.goBack();
            return;
          }
          try {
            await cancelRide(rideId, reason, 'rider');
            analyticsEvents.rideCancelled(rideId, reason, 'rider');
            Alert.alert('Cancelled', 'Ride cancelled');
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not cancel');
          }
        }}
        isDriver={false}
      />
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, width: '100%' },
  emergencyFloating: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: theme.colors.error,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  emergencyText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 14, marginTop: 4 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  etaCard: {
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  etaLabel: { fontSize: 12, color: theme.colors.secondary },
  etaValue: { fontSize: 24, fontWeight: 'bold', color: theme.colors.onPrimary },
  driverCard: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  driverName: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  fare: { fontSize: 20, color: theme.colors.accent, marginTop: 4 },
  coinsSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.primaryLight,
  },
  coinsSectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  coinsSectionMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  coinsSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  coinsSwitchLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  coinsSectionHint: { fontSize: 12, color: theme.colors.error, marginTop: 8 },
  contactRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    padding: 10,
    borderRadius: 8,
  },
  contactText: { color: theme.colors.onPrimary, fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  cancelRideBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.error + '30',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelRideText: { color: theme.colors.error, fontWeight: 'bold', fontSize: 14 },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.primaryLight,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionText: { color: theme.colors.onPrimary, fontSize: 12, marginTop: 4 },
  completeBtn: {
    flex: 2,
    backgroundColor: theme.colors.success,
    padding: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeText: { color: theme.colors.white, fontSize: 16, fontWeight: 'bold' },
});
