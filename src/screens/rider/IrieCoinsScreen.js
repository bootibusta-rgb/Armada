import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { withSectionGuide } from '../../components/withSectionGuide';
import { DEFAULT_RIDER_COINS_FALLBACK, MAX_COIN_REDEMPTIONS_PER_MONTH } from '../../constants/armadaCoins';
import { getRedemptionSummary, canApplyCoinRedemption } from '../../services/iriCoinsService';

function IrieCoinsScreen() {
  const { theme } = useTheme();
  const { userProfile, refreshUserProfile } = useAuth();
  const coins = userProfile?.irieCoins ?? DEFAULT_RIDER_COINS_FALLBACK;
  const redemption = getRedemptionSummary(userProfile || {});
  const canRedeemNow = canApplyCoinRedemption(userProfile, coins);
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
      <Text style={styles.subtitle}>1 Armada coin = J$1 credit • New riders start with 100 coins (J$100)</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Earn</Text>
        <Text style={styles.cardText}>1 coin per J$100 spent on rides</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Redeem</Text>
        <Text style={styles.cardText}>
          Each redemption uses 100 coins for J$100 off one ride. You can redeem at most {MAX_COIN_REDEMPTIONS_PER_MONTH} times per
          calendar month — even if your balance is higher. Unused redemptions don’t roll over; the cap resets on the 1st.
        </Text>
        <Text style={styles.cardHighlight}>
          This month: {redemption.remaining} of {redemption.limit} redemptions left · {redemption.used} used
        </Text>
        <Text style={[styles.cardText, { marginTop: 10 }]}>
          When you apply coins on an active ride or at payment, your driver gets a push notification and an in-app note so they
          expect the reduced fare.
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.redeemBtn, !canRedeemNow && styles.redeemBtnDisabled]}
        onPress={() =>
          canRedeemNow
            ? Alert.alert(
                'Redeem at checkout',
                `On Home, turn on “Use 100 coins for J$100 off” before you request a ride. You have ${redemption.remaining} redemption${redemption.remaining === 1 ? '' : 's'} left this month (${MAX_COIN_REDEMPTIONS_PER_MONTH} max).`,
                [{ text: 'OK' }]
              )
            : coins < 100
              ? null
              : Alert.alert(
                  'Monthly redemption limit',
                  `You’ve used all ${MAX_COIN_REDEMPTIONS_PER_MONTH} coin redemptions this month. Your balance (${coins}) still grows — try again next month.`,
                  [{ text: 'OK' }]
                )
        }
        disabled={coins < 100}
      >
        <Text style={styles.redeemText}>
          {!canRedeemNow && coins >= 100
            ? 'Monthly limit reached'
            : coins >= 100
              ? 'How to redeem'
              : 'Need 100 coins to redeem'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default withSectionGuide(IrieCoinsScreen, 'rider_coins');

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
  cardHighlight: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginTop: 12,
  },
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
