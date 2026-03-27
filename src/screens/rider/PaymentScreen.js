/**
 * Payment Screen - Rider pays agreed fare
 *
 * Flow:
 * 1. Rider and driver agree on exact fare (e.g., 1000 JMD) before reaching this screen
 * 2. Agreed fare is stored in route.params.fare
 * 3. Rider selects Cash or Card (PayPal)
 * 4. For PayPal: Rider must enter amount that exactly matches agreed fare (no partials)
 * 5. "Pay with PayPal" is disabled until amount matches
 * 6. On match: PayPal SDK opens with fixed amount (no editable field)
 * 7. Success: Payment captured, confirmation shown, ride complete
 *
 * - Cash: Pay driver directly
 * - PayPal (web): Uses @paypal/react-paypal-js. Guest checkout (card) supported.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { processCashFlag, processCardPayment } from '../../services/paymentService';
import {
  earnCoins,
  redeemCoins,
  REDEEM_DISCOUNT,
  canApplyCoinRedemption,
  getCurrentRedemptionMonthKey,
} from '../../services/iriCoinsService';
import { DEFAULT_RIDER_COINS_FALLBACK } from '../../constants/armadaCoins';
import { submitRating } from '../../services/ratingService';
import { analyticsEvents } from '../../services/analyticsService';
import { useTheme } from '../../context/ThemeContext';
import PayPalButton from '../../components/PayPalButton';
import RatingModal from '../../components/RatingModal';

export default function PaymentScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { fare, driver, useRedeem, rideId, pickup, dropoff } = route.params || {};
  const { userProfile, setUserProfile, refreshUserProfile, demoMode } = useAuth();
  const styles = createStyles(theme);

  const coinsBal = userProfile?.irieCoins ?? DEFAULT_RIDER_COINS_FALLBACK;
  const redeemEligible = canApplyCoinRedemption(userProfile, coinsBal);
  const effectiveUseRedeem = !!useRedeem && redeemEligible;

  // Agreed fare (stored from ride agreement) - no partials allowed
  const agreedFare = (fare || 1500) - (effectiveUseRedeem ? REDEEM_DISCOUNT : 0);

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [receiptParams, setReceiptParams] = useState(null);
  // User-entered amount for PayPal - must match agreedFare exactly
  const [enteredAmount, setEnteredAmount] = useState('');
  const [paypalError, setPaypalError] = useState(null);

  const amountMatch = enteredAmount.trim() === String(agreedFare);

  const handleCashPay = async () => {
    setLoading(true);
    try {
      if (demoMode) {
        Alert.alert('Demo', 'Payment logged. Ride complete!');
        completeRide(agreedFare);
        return;
      }
      const rId = route.params?.rideId ?? rideId;
      if (!rId) {
        Alert.alert('Error', 'Ride not found. Please go back and try again.');
        setLoading(false);
        return;
      }
      await processCashFlag(rId, agreedFare);
      Alert.alert('Cash', `Pay driver ${agreedFare} JMD in cash. Ride complete!`);
      completeRide(agreedFare);
    } catch (e) {
      Alert.alert('Payment Failed', e.message || 'Could not process. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const completeRide = (amountPaid, method = paymentMethod) => {
    if (demoMode) {
      let newCoins = coinsBal + Math.floor(amountPaid / 100);
      let nextProfile = { ...userProfile };
      if (effectiveUseRedeem) {
        newCoins -= 100;
        const monthKey = getCurrentRedemptionMonthKey();
        const storedMonth = userProfile?.coinRedemptionMonth;
        let count = storedMonth === monthKey ? (userProfile?.coinRedemptionCount ?? 0) : 0;
        nextProfile = {
          ...nextProfile,
          coinRedemptionMonth: monthKey,
          coinRedemptionCount: count + 1,
        };
      }
      setUserProfile({ ...nextProfile, irieCoins: Math.max(0, newCoins) });
    } else if (userProfile?.id) {
      earnCoins(userProfile.id, amountPaid).catch(() => {});
      if (effectiveUseRedeem) redeemCoins(userProfile.id).catch(() => {});
      refreshUserProfile();
    }
    setReceiptParams({
      rideId,
      pickup,
      dropoff,
      fare: agreedFare,
      driver,
      completedAt: new Date().toISOString(),
      paymentMethod: method || 'cash',
    });
    if (rideId && driver?.id && !demoMode) {
      setShowRating(true);
    } else {
      goHome();
    }
  };

  const goHome = () => {
    setShowRating(false);
    const params = receiptParams || { rideId, pickup, dropoff, fare: agreedFare, driver, completedAt: new Date().toISOString(), paymentMethod: paymentMethod || 'cash' };
    if (params.rideId) {
      navigation.reset({
        index: 1,
        routes: [{ name: 'RiderHome' }, { name: 'RideReceipt', params }],
      });
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'RiderHome' }] });
    }
  };

  const handleRateDriver = async (stars) => {
    try {
      if (rideId && driver?.id) {
        await submitRating(rideId, userProfile?.id, driver.id, stars, 'rider');
        analyticsEvents.driverRated?.(rideId, driver.id, stars);
      }
    } catch (e) {
      console.warn('Rating failed:', e?.message);
    }
    goHome();
  };

  const handlePayPalSuccess = async (details) => {
    setPaypalError(null);
    try {
      const rId = route.params?.rideId ?? rideId;
      if (!demoMode && rId) {
        const txId = details?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
        await processCardPayment(rId, agreedFare, txId || undefined);
      }
      Alert.alert('Payment Complete', `${agreedFare} JMD charged successfully. Ride complete!`);
      completeRide(agreedFare, 'card');
    } catch (e) {
      Alert.alert('Payment Failed', e.message || 'Could not complete. Please contact support.');
    }
  };

  const handlePayPalError = (err) => {
    setPaypalError(err?.message || 'PayPal payment failed. Please try again.');
    Alert.alert('Payment Failed', err?.message || 'PayPal error. Please try again.');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Payment</Text>

        {/* Agreed fare - clearly displayed */}
        <View style={styles.fareCard}>
          <Text style={styles.fareLabel}>Fare</Text>
          <Text style={styles.fare}>{agreedFare} JMD</Text>
          {effectiveUseRedeem && (
            <Text style={styles.redeemBadge}>100 coins redeemed for J$100 off</Text>
          )}
          {useRedeem && !redeemEligible && (
            <Text style={styles.redeemWarn}>
              Coin discount not applied — you’ve used all 3 redemptions this month. Fare is without the J$100 coin discount.
            </Text>
          )}
        </View>

        <Text style={styles.driver}>Driver: {driver?.name || 'Driver'}</Text>

        {/* Payment method toggle */}
        <View style={styles.options}>
          <TouchableOpacity
            style={[styles.option, paymentMethod === 'cash' && styles.optionActive]}
            onPress={() => { setPaymentMethod('cash'); setPaypalError(null); }}
          >
            <Ionicons name="cash" size={32} color={paymentMethod === 'cash' ? theme.colors.onPrimary : theme.colors.primary} />
            <Text style={[styles.optionText, paymentMethod === 'cash' && styles.optionTextActive]}>Cash</Text>
            <Text style={styles.optionSub}>Pay driver directly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.option, paymentMethod === 'card' && styles.optionActive]}
            onPress={() => { setPaymentMethod('card'); setPaypalError(null); }}
          >
            <Ionicons name="card" size={32} color={paymentMethod === 'card' ? theme.colors.onPrimary : theme.colors.primary} />
            <Text style={[styles.optionText, paymentMethod === 'card' && styles.optionTextActive]}>Card</Text>
            <Text style={styles.optionSub}>PayPal / Guest checkout</Text>
          </TouchableOpacity>
        </View>

        {paymentMethod === 'cash' ? (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleCashPay}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Processing...' : `Pay ${agreedFare} JMD (Cash)`}</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Amount confirmation - must match exactly */}
            <Text style={styles.amountLabel}>Enter amount to confirm (must match exactly)</Text>
            <TextInput
              style={[styles.input, !amountMatch && enteredAmount.trim() && styles.inputError]}
              placeholder={`${agreedFare}`}
              value={enteredAmount}
              onChangeText={(v) => { setEnteredAmount(v); setPaypalError(null); }}
              keyboardType="number-pad"
              placeholderTextColor={theme.colors.textSecondary}
            />
            {!amountMatch && enteredAmount.trim() ? (
              <Text style={styles.errorText}>Must be exactly {agreedFare} JMD</Text>
            ) : null}
            {paypalError ? <Text style={styles.errorText}>{paypalError}</Text> : null}

            {/* PayPal button - only shown when amount matches (web) or placeholder (native) */}
            {amountMatch ? (
              <PayPalButton
                amount={agreedFare}
                currency="JMD"
                onSuccess={handlePayPalSuccess}
                onError={handlePayPalError}
              />
            ) : (
              <View style={styles.disabledPay}>
                <Text style={styles.disabledText}>Enter exactly {agreedFare} JMD to enable PayPal</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <RatingModal
        visible={showRating}
        title="Rate your driver"
        subTitle={driver?.name}
        onRate={handleRateDriver}
        onSkip={goHome}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, textAlign: 'center', marginBottom: 16 },
  fareCard: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  fareLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  fare: { fontSize: 36, fontWeight: 'bold', color: theme.colors.accent },
  redeemBadge: { fontSize: 12, color: theme.colors.success, marginTop: 8 },
  redeemWarn: { fontSize: 12, color: theme.colors.error, marginTop: 10, textAlign: 'center', lineHeight: 17 },
  driver: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  options: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  option: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  optionActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.secondary },
  optionText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginTop: 8 },
  optionTextActive: { color: theme.colors.onPrimary },
  optionSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  amountLabel: { fontSize: 14, color: theme.colors.text, marginBottom: 8, fontWeight: '500' },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  inputError: { borderColor: theme.colors.error },
  errorText: { fontSize: 13, color: theme.colors.error, marginTop: 8 },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  disabledPay: {
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  disabledText: { fontSize: 14, color: theme.colors.textSecondary },
});
