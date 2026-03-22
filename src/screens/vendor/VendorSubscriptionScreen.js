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
import { VENDOR_PLANS } from '../../config/vendorPricing';
import {
  payVendorSubscriptionWithPayPal,
  payVendorSubscriptionFallback,
} from '../../services/vendorSubscriptionPayPalService';

export default function VendorSubscriptionScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { user, userProfile, setUserProfile, refreshUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const subscription = userProfile?.vendorSubscription || null;

  const runPayForPlan = useCallback(
    async (plan) => {
      if (!isFirebaseReady || !user?.uid) {
        Alert.alert('Unavailable', 'Firebase required.');
        return;
      }
      setLoading(true);
      setSelectedPlan(plan);
      try {
        const r = await payVendorSubscriptionWithPayPal(plan.id);
        if (r.success && r.vendorSubscription) {
          setUserProfile((p) => (p ? { ...p, vendorSubscription: r.vendorSubscription } : p));
          await refreshUserProfile?.();
          Alert.alert(
            'Subscribed',
            `${plan.label} active until ${new Date(r.vendorSubscription.expiresAt).toLocaleDateString()}.`
          );
          return;
        }
        if (r.cancelled) {
          Alert.alert('Cancelled', 'No charge. Choose a plan again when ready.');
          return;
        }
        const msg = r.error || 'Payment did not complete.';
        const paypalMissing =
          r.code === 'functions/failed-precondition' &&
          (/paypal|PayPal|not configured|INVALID/i.test(msg) || /credential|secret/i.test(msg));
        if (paypalMissing) {
          Alert.alert(
            'PayPal not configured',
            'Activate this plan without PayPal for local testing? (Not for production.)',
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes (dev)',
                onPress: async () => {
                  try {
                    const nextSub = await payVendorSubscriptionFallback(user.uid, plan);
                    setUserProfile((p) => (p ? { ...p, vendorSubscription: nextSub } : p));
                    await refreshUserProfile?.();
                    Alert.alert('OK', 'Vendor premium extended (dev fallback).');
                  } catch (e) {
                    Alert.alert('Error', e.message || 'Failed', [
                      { text: 'OK', style: 'cancel' },
                      { text: 'Try again', onPress: () => void runPayForPlan(plan) },
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
          `${msg}\n\nIf you already paid in PayPal, tap Try again — we'll sync your subscription.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try again', onPress: () => void runPayForPlan(plan) },
          ]
        );
      } catch (e) {
        const msg = e?.message || 'Network error. Check your connection.';
        Alert.alert(
          'Payment failed',
          `${msg}\n\nTap Try again to retry (you won't be charged twice for the same approval).`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try again', onPress: () => void runPayForPlan(plan) },
          ]
        );
      } finally {
        setLoading(false);
        setSelectedPlan(null);
      }
    },
    [user?.uid, setUserProfile, refreshUserProfile]
  );

  const confirmPay = (plan) => {
    Alert.alert(
      'Pay with PayPal',
      `${plan.label} — J$${plan.price.toLocaleString()} total.\n\nPayPal opens next. Premium activates only after payment succeeds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => void runPayForPlan(plan) },
      ]
    );
  };

  const isExpired = subscription?.expiresAt && new Date(subscription.expiresAt) < new Date();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Vendor Premium</Text>
      <Text style={styles.subtitle}>
        Pay to list your spot on Armada. Riders can add you as a food stop. Amount is set on our servers for your
        selected plan.
      </Text>

      {subscription && !isExpired && (
        <View style={styles.activeCard}>
          <Ionicons name="checkmark-circle" size={32} color={theme.colors.green} />
          <View style={styles.activeInfo}>
            <Text style={styles.activeLabel}>Active: {subscription.planLabel}</Text>
            <Text style={styles.activeExpiry}>
              Expires: {new Date(subscription.expiresAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      )}

      {(!subscription || isExpired) && (
        <>
          <Text style={styles.sectionTitle}>Choose a plan</Text>
          {VENDOR_PLANS.map((plan) => (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                plan.popular && styles.planPopular,
              ]}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Best value</Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <Text style={styles.planLabel}>{plan.label}</Text>
                <Text style={styles.planPrice}>J${plan.price.toLocaleString()}</Text>
              </View>
              <Text style={styles.planPerWeek}>
                J${plan.perWeek}/week • {plan.duration} days
              </Text>
              <TouchableOpacity
                style={[styles.subscribeBtn, loading && styles.btnDisabled]}
                onPress={() => confirmPay(plan)}
                disabled={loading}
              >
                <Text style={styles.subscribeBtnText}>
                  {loading && selectedPlan?.id === plan.id ? 'Processing…' : 'Pay with PayPal'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <Text style={styles.footer}>
        Same secure flow as car rental listing: PayPal Orders, server verifies capture, no double charge if you tap
        Try again after approval.
      </Text>
    </ScrollView>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, margin: 24, marginBottom: 8 },
    subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginHorizontal: 24, marginBottom: 24 },
    activeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.green + '20',
      marginHorizontal: 24,
      padding: 20,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.colors.green,
      marginBottom: 24,
    },
    activeInfo: { marginLeft: 12 },
    activeLabel: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
    activeExpiry: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginHorizontal: 24, marginBottom: 16 },
    planCard: {
      marginHorizontal: 24,
      marginBottom: 16,
      backgroundColor: theme.colors.surface,
      padding: 20,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      position: 'relative',
    },
    planPopular: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + '10' },
    popularBadge: {
      position: 'absolute',
      top: -10,
      right: 16,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    popularText: { fontSize: 11, color: theme.colors.onPrimary, fontWeight: 'bold' },
    planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    planLabel: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
    planPrice: { fontSize: 22, fontWeight: 'bold', color: theme.colors.accent },
    planPerWeek: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 },
    subscribeBtn: {
      backgroundColor: theme.colors.primary,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    btnDisabled: { opacity: 0.6 },
    subscribeBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
    footer: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      margin: 24,
      lineHeight: 18,
    },
  });
