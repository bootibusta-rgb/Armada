import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { processGoldTierPayment } from '../../services/paymentService';
import { useTheme } from '../../context/ThemeContext';

export default function GoldTierScreen() {
  const { theme } = useTheme();
  const [isGold, setIsGold] = useState(false);
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await processGoldTierPayment(200);
      setIsGold(true);
      Alert.alert('Gold Tier', 'J$200/day paid. You now get priority on corporate shifts!');
    } catch (e) {
      Alert.alert('Demo', 'Payment logged. Gold Tier activated!');
      setIsGold(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, isGold && styles.cardGold]}>
        <Ionicons name="star" size={48} color={isGold ? theme.colors.secondary : theme.colors.textSecondary} />
        <Text style={styles.title}>Gold Tier</Text>
        <Text style={styles.subtitle}>
          {isGold
            ? 'Active – priority on corporate shifts'
            : 'Pay J$200/day for priority on company shifts'}
        </Text>
        {!isGold && (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Processing...' : 'Pay J$200/day'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.note}>Fake payment screen – logs subscription for demo</Text>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardGold: { borderColor: theme.colors.secondary, backgroundColor: theme.colors.card },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginTop: 16 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center' },
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
  note: { marginTop: 16, fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center' },
});
