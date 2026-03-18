import React, { useState } from 'react';
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
import { VENDOR_PLANS } from '../../config/vendorPricing';

export default function VendorSubscriptionScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile, setUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const subscription = userProfile?.vendorSubscription || null;

  const handleSubscribe = async (plan) => {
    setSelectedPlan(plan);
    setLoading(true);
    try {
      // In production: call payment API (PayPal, Stripe, etc.)
      await new Promise((r) => setTimeout(r, 800));
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + plan.duration);
      const newSub = {
        planId: plan.id,
        planLabel: plan.label,
        price: plan.price,
        expiresAt: expiresAt.toISOString(),
        status: 'active',
      };
      setUserProfile({
        ...userProfile,
        vendorSubscription: newSub,
      });
      Alert.alert('Success', `Subscribed for ${plan.label}! J$${plan.price.toLocaleString()} paid. Active until ${new Date(newSub.expiresAt).toLocaleDateString()}.`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  const isExpired = subscription?.expiresAt && new Date(subscription.expiresAt) < new Date();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Vendor Premium</Text>
      <Text style={styles.subtitle}>Pay to list your spot on Armada. Riders can add you as a food stop.</Text>

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
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                plan.popular && styles.planPopular,
              ]}
              onPress={() => handleSubscribe(plan)}
              disabled={loading}
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
                onPress={() => handleSubscribe(plan)}
                disabled={loading}
              >
                <Text style={styles.subscribeBtnText}>
                  {loading && selectedPlan?.id === plan.id ? 'Processing...' : 'Subscribe'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Text style={styles.footer}>
        Payment via cash (pay at Armada office) or card. Contact support for bulk discounts.
      </Text>
    </ScrollView>
  );
}

const createStyles = (theme) => StyleSheet.create({
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
