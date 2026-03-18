import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function IrieCoinsScreen() {
  const { theme } = useTheme();
  const { userProfile, refreshUserProfile } = useAuth();
  const coins = userProfile?.irieCoins ?? 150;
  const styles = createStyles(theme);

  useFocusEffect(
    useCallback(() => {
      refreshUserProfile?.();
    }, [refreshUserProfile])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.emoji}>🇯🇲</Text>
      <Text style={styles.title}>Armada Coins</Text>
      <Text style={styles.balance}>{coins}</Text>
      <Text style={styles.subtitle}>Loyalty points – earn & redeem</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Earn</Text>
        <Text style={styles.cardText}>1 coin per J$100 spent on rides</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Redeem</Text>
        <Text style={styles.cardText}>100 coins = J$50 off your next ride</Text>
      </View>
      <TouchableOpacity
        style={[styles.redeemBtn, coins < 100 && styles.redeemBtnDisabled]}
        onPress={() =>
          coins >= 100
            ? Alert.alert(
                'Redeem at checkout',
                'Use 100 coins for J$50 off when booking your next ride. Toggle "Use 100 coins for J$50 off" on the home screen.',
                [{ text: 'OK' }]
              )
            : null
        }
        disabled={coins < 100}
      >
        <Text style={styles.redeemText}>
          {coins >= 100 ? 'How to redeem' : 'Need 100 coins to redeem'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 48,
  },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary },
  balance: { fontSize: 48, fontWeight: 'bold', color: theme.colors.secondary, marginVertical: 16 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  card: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  cardText: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  redeemBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  redeemBtnDisabled: { opacity: 0.6 },
  redeemText: { color: theme.colors.white, fontSize: 18, fontWeight: 'bold' },
});
