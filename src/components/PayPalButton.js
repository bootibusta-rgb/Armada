/**
 * PayPal for native (iOS/Android). Opens Pay Now link in browser.
 * Web uses PayPalButton.web.js with react-paypal-js.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const PAYMENT_LINK = process.env.EXPO_PUBLIC_PAYPAL_PAYMENT_LINK;

export default function PayPalButton({ amount, currency, onSuccess, onError }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const handleOpenPayPal = async () => {
    if (!PAYMENT_LINK) {
      onError?.({ message: 'PayPal link not configured. Use web for card payment.' });
      return;
    }
    try {
      const supported = await Linking.canOpenURL(PAYMENT_LINK);
      if (supported) {
        await Linking.openURL(PAYMENT_LINK);
        Alert.alert(
          'Complete Payment',
          `After paying J$${amount} in the browser, tap OK to complete your ride.`,
          [{ text: 'OK', onPress: () => onSuccess?.({}) }]
        );
      } else {
        onError?.({ message: 'Could not open PayPal' });
      }
    } catch (err) {
      onError?.(err);
    }
  };

  if (!PAYMENT_LINK) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.text}>PayPal available on web</Text>
        <Text style={styles.sub}>Run the app in a browser for card payment.</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.button} onPress={handleOpenPayPal}>
      <Ionicons name="logo-paypal" size={24} color={theme.colors.onPrimary} />
      <Text style={styles.buttonText}>Pay J${amount} with PayPal</Text>
      <Text style={styles.buttonSub}>Opens in browser</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme) => StyleSheet.create({
  placeholder: {
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  text: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#003087',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  buttonSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 4 },
});
