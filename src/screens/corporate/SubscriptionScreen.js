import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { processCorporateSubscription } from '../../services/paymentService';
import { useTheme } from '../../context/ThemeContext';

export default function SubscriptionScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await processCorporateSubscription(50000);
      setSubscribed(true);
      Alert.alert('Subscription', 'J$50,000/month logged. Corporate plan active!');
    } catch (e) {
      Alert.alert('Demo', 'Payment logged. J$50k/month subscription active!');
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Monthly subscription</Text>
      <Text style={styles.subtitle}>J$50,000/month for corporate ride booking</Text>
      <View style={styles.card}>
        <Text style={styles.price}>J$50,000</Text>
        <Text style={styles.period}>/ month</Text>
        {!subscribed ? (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Processing...' : 'Subscribe'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.active}>Active</Text>
        )}
      </View>
      <Text style={styles.note}>Fake payment – logs subscription for demo</Text>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  price: { fontSize: 36, fontWeight: 'bold', color: theme.colors.primary },
  period: { fontSize: 18, color: theme.colors.textSecondary, marginTop: 4 },
  button: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  active: { marginTop: 24, fontSize: 20, fontWeight: 'bold', color: theme.colors.success },
  note: { marginTop: 24, fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center' },
});
