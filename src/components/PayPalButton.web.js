/**
 * PayPal button for web. Uses @paypal/react-paypal-js SDK.
 * Use a Live Client ID from developer.paypal.com (Live tab) for real charges.
 * - Fixed amount (no editable field on PayPal side)
 * - Guest checkout (debit/credit without PayPal account)
 * - Requires EXPO_PUBLIC_PAYPAL_CLIENT_ID in .env
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useTheme } from '../context/ThemeContext';

const PAYPAL_CLIENT_ID = process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID;

export default function PayPalButton({ amount, currency, onSuccess, onError }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  if (!PAYPAL_CLIENT_ID) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>PayPal not configured</Text>
        <Text style={styles.placeholderSub}>
          Add EXPO_PUBLIC_PAYPAL_CLIENT_ID to .env (see PAYPAL_SETUP.md)
        </Text>
      </View>
    );
  }

  const value = String(amount);
  const options = {
    clientId: PAYPAL_CLIENT_ID,
    currency: currency || 'JMD',
    intent: 'capture',
    components: 'buttons',
    vault: false,
  };

  return (
    <View style={styles.wrapper}>
      <PayPalScriptProvider options={options}>
        <PayPalButtons
          style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
          createOrder={(data, actions) => {
            // Fixed amount - no user editing on PayPal side
            return actions.order.create({
              intent: 'CAPTURE',
              purchase_units: [
                {
                  amount: {
                    currency_code: currency || 'JMD',
                    value,
                  },
                  description: 'Armada ride fare',
                },
              ],
            });
          }}
          onApprove={async (data, actions) => {
            try {
              const details = await actions.order.capture();
              onSuccess?.(details);
            } catch (err) {
              onError?.(err);
            }
          }}
          onError={(err) => {
            onError?.(err);
          }}
          onCancel={() => {
            // User closed PayPal popup - no error, they can try again
          }}
        />
      </PayPalScriptProvider>
      {/* Guest checkout: "Pay with Debit or Credit Card" appears when enabled in PayPal account */}
      <Text style={styles.guestNote}>Or pay with debit/credit card (no PayPal account)</Text>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  wrapper: { minHeight: 120, marginTop: 16 },
  placeholder: {
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  placeholderText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  placeholderSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 },
  guestNote: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 12, textAlign: 'center' },
});
