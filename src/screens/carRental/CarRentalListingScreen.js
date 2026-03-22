import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isFirebaseReady } from '../../config/firebase';
import {
  countRentalVehiclesForBilling,
  isCarRentalListingSubscriptionActive,
  computeWeeklyListingTotalJmd,
} from '../../services/carRentalService';
import { CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD } from '../../config/carRentalPricing';
import {
  payCarRentalListingWithPayPal,
  payCarRentalListingFallback,
} from '../../services/carRentalListingPayPalService';

export default function CarRentalListingScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { user, userProfile, refreshUserProfile, setUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const vehicleCount = countRentalVehiclesForBilling(userProfile);
  const weeklyTotal = computeWeeklyListingTotalJmd(vehicleCount);
  const sub = userProfile?.rentalListingSubscription || null;
  const active = isCarRentalListingSubscriptionActive(userProfile);
  const verified = userProfile?.idVerified === true;

  const runPayListingAttempt = useCallback(async () => {
    if (!isFirebaseReady || !user?.uid) {
      Alert.alert('Unavailable', 'Firebase required.');
      return;
    }
    setLoading(true);
    try {
      const r = await payCarRentalListingWithPayPal();
      if (r.success) {
        if (r.subscription) {
          setUserProfile((p) => (p ? { ...p, rentalListingSubscription: r.subscription } : p));
        }
        await refreshUserProfile?.();
        Alert.alert(
          'Paid',
          `Listing active until ${r.subscription?.expiresAt ? new Date(r.subscription.expiresAt).toLocaleString() : '—'}.`
        );
        return;
      }
      if (r.cancelled) {
        Alert.alert('Cancelled', 'No charge. You can start payment again when ready.');
        return;
      }
      const msg = r.error || 'Payment did not complete.';
      const paypalMissing =
        r.code === 'functions/failed-precondition' &&
        (/paypal|PayPal|not configured/i.test(msg) || /INVALID/i.test(msg));
      if (paypalMissing) {
        Alert.alert(
          'PayPal not configured',
          'Activate listing without PayPal for testing? (Not for production.)',
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes (dev)',
              onPress: async () => {
                try {
                  const nextSub = await payCarRentalListingFallback(user.uid, userProfile);
                  setUserProfile((p) => (p ? { ...p, rentalListingSubscription: nextSub } : p));
                  await refreshUserProfile?.();
                  Alert.alert('OK', 'Listing extended (dev fallback).');
                } catch (e) {
                  Alert.alert('Error', e.message || 'Failed', [
                    { text: 'OK', style: 'cancel' },
                    { text: 'Try again', onPress: () => void runPayListingAttempt() },
                  ]);
                }
              },
            },
          ]
        );
        return;
      }
      Alert.alert(
        "Payment didn't finish",
        `${msg}\n\nIf you completed PayPal, tap Try again — we'll sync your listing.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', onPress: () => void runPayListingAttempt() },
        ]
      );
    } catch (e) {
      const msg = e?.message || 'Network error. Check your connection.';
      Alert.alert(
        'Payment failed',
        `${msg}\n\nTap Try again to retry capture (you won't be charged twice for the same approval).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', onPress: () => void runPayListingAttempt() },
        ]
      );
    } finally {
      setLoading(false);
    }
  }, [
    user?.uid,
    userProfile,
    refreshUserProfile,
    setUserProfile,
    setLoading,
  ]);

  const payWeek = () => {
    if (!isFirebaseReady || !user?.uid) {
      Alert.alert('Unavailable', 'Firebase required.');
      return;
    }
    Alert.alert(
      'Pay with PayPal',
      `J$${weeklyTotal.toLocaleString()} for ${vehicleCount} vehicle(s) × J$${CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD.toLocaleString()} per week.\n\nPayPal will open — your listing renews only after payment succeeds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => void runPayListingAttempt() },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Listing on Armada</Text>
      <Text style={styles.subtitle}>
        J${CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD.toLocaleString()} per vehicle per week. Amount is set by Armada
        from your vehicle count — PayPal charges exactly that total. ID verification and vehicle documents are required
        at signup.
      </Text>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Vehicles on your profile</Text>
        <Text style={styles.priceBig}>{vehicleCount}</Text>
        <Text style={styles.priceHint}>Primary + any extra vehicles you added</Text>
        <Text style={styles.priceTotal}>Due for 1 week: J${weeklyTotal.toLocaleString()}</Text>
      </View>

      {!verified && (
        <View style={styles.warn}>
          <Ionicons name="alert-circle" size={22} color={theme.colors.error} />
          <Text style={styles.warnText}>Complete ID verification on signup (or contact support) to go live.</Text>
        </View>
      )}

      {active && sub?.expiresAt && (
        <View style={styles.activeCard}>
          <Ionicons name="checkmark-circle" size={32} color={theme.colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.activeLabel}>Listing paid</Text>
            <Text style={styles.activeExpiry}>
              Visible to riders until {new Date(sub.expiresAt).toLocaleString()}
            </Text>
            {sub.amountPaidJmd != null ? (
              <Text style={styles.activeMeta}>Last payment: J${Number(sub.amountPaidJmd).toLocaleString()}</Text>
            ) : null}
            {sub.paypalCaptureId ? (
              <Text style={styles.activeMeta}>PayPal capture: {String(sub.paypalCaptureId).slice(0, 12)}…</Text>
            ) : null}
          </View>
        </View>
      )}

      {(!active || !sub) && (
        <View style={styles.expiredCard}>
          <Text style={styles.expiredTitle}>Not visible to riders</Text>
          <Text style={styles.expiredText}>
            Pay the weekly fee with PayPal to publish your listing in Rent a Car.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.payBtn, loading && styles.payBtnDisabled]}
        onPress={payWeek}
        disabled={loading}
      >
        <Text style={styles.payBtnText}>
          {loading
            ? 'Processing…'
            : active
              ? `Renew 1 week — J$${weeklyTotal.toLocaleString()}`
              : `Pay with PayPal — J$${weeklyTotal.toLocaleString()}`}
        </Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Server creates a PayPal order for exactly J${weeklyTotal.toLocaleString()} (dynamic from your vehicle count).
        Your subscription updates only after PayPal confirms the full capture.
      </Text>
    </ScrollView>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
    subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20, lineHeight: 20 },
    priceCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 18,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      marginBottom: 16,
      alignItems: 'center',
    },
    priceLabel: { fontSize: 13, color: theme.colors.textSecondary },
    priceBig: { fontSize: 42, fontWeight: '800', color: theme.colors.primary, marginVertical: 4 },
    priceHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 },
    priceTotal: { fontSize: 17, fontWeight: '700', color: theme.colors.success },
    warn: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      backgroundColor: (theme.colors.error || '#DC2626') + '18',
      padding: 12,
      borderRadius: 10,
      marginBottom: 16,
    },
    warnText: { flex: 1, fontSize: 13, color: theme.colors.text },
    activeCard: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.success + '15',
      padding: 16,
      borderRadius: 12,
      marginBottom: 16,
    },
    activeLabel: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
    activeExpiry: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
    activeMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
    expiredCard: {
      padding: 14,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      marginBottom: 16,
    },
    expiredTitle: { fontWeight: '700', color: theme.colors.primary },
    expiredText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
    payBtn: {
      backgroundColor: theme.colors.orange,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    payBtnDisabled: { opacity: 0.65 },
    payBtnText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 16 },
    footer: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 20, lineHeight: 18 },
  });
