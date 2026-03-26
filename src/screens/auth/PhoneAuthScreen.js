import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { sendOTP } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import { isProductionApp } from '../../config/appEnv';
import { APP_UI_BUILD_TAG } from '../../constants/appBuildTag';

export default function PhoneAuthScreen({ navigation }) {
  const { theme } = useTheme();
  const [phone, setPhone] = useState('+1876');
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert('Error', 'Enter a valid Jamaican phone number');
      return;
    }
    setLoading(true);
    try {
      const confirmation = await sendOTP(phone);
      navigation.navigate('OTP', { confirmation, phone });
    } catch (e) {
      if (isProductionApp) {
        Alert.alert('Error', e.message || 'Failed to send OTP. Check your number and try again.');
      } else {
        Alert.alert('Error', e.message || 'Failed to send OTP. Use demo mode.');
        navigation.navigate('OTP', { phone, demo: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Armada 🇯🇲</Text>
        <Text style={styles.subtitle}>Bid your price. Ride Armada.</Text>
        <Text style={styles.buildTag} selectable>
          {APP_UI_BUILD_TAG}
        </Text>
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="+1 876 123 4567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={theme.colors.textSecondary}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOTP}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send OTP'}</Text>
          </TouchableOpacity>
          {!isProductionApp && (
            <TouchableOpacity
              style={styles.demoButton}
              onPress={() => navigation.navigate('OTP', { phone: phone.replace(/\s/g, '') || '+18761234567', demo: true })}
            >
              <Text style={styles.demoText}>
                {Platform.OS === 'web' ? 'Demo Mode (skip OTP)' : 'Demo Mode (or use dev build for real OTP)'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.legalLinks}>
          <Text style={styles.legalText}>By continuing, you agree to our </Text>
          <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}> and </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Terms')}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}>.</Text>
        </View>
      </ScrollView>
      <View id="recaptcha-container" />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  buildTag: {
    fontSize: 11,
    color: theme.colors.primary,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    fontSize: 18,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  demoButton: {
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: theme.colors.yellow,
    borderRadius: theme.borderRadius.md,
  },
  demoText: {
    color: theme.colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
  legalText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  legalLink: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
