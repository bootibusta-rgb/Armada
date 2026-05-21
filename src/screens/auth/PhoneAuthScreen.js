import React, { useState, useEffect } from 'react';
import {
  View,
  Text,

  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import ThemedTextInput from '../../components/ThemedTextInput';

import { sendOTP, getCurrentAuthUid, phoneAuthAlertMessage } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import AppPressable from '../../components/AppPressable';
import { getNativeAppBuildLabel } from '../../constants/nativeAppBuildLabel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ARMADA_LAST_PHONE_E164_KEY } from '../../constants/authStorageKeys';
import { getPhoneAuthInstallWarning } from '../../constants/phoneAuthReleaseGate';

export default function PhoneAuthScreen({ navigation }) {
  const { theme } = useTheme();
  const { user, userProfile, loading: authLoading } = useAuth();
  const [phone, setPhone] = useState('+1876');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ARMADA_LAST_PHONE_E164_KEY)
      .then((stored) => {
        if (cancelled || !stored || String(stored).trim().length < 10) return;
        setPhone(String(stored).trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Firebase session exists but no Firestore profile yet — don't leave user on the phone screen forever.
  useEffect(() => {
    if (authLoading) return;
    const uid = getCurrentAuthUid(user);
    if (uid && !userProfile) {
      navigation.replace('RoleSelect');
    }
  }, [authLoading, user, userProfile, navigation]);

  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert('Error', 'Enter a valid Jamaican phone number');
      return;
    }
    setLoading(true);
    try {
      await sendOTP(phone);
      try {
        await AsyncStorage.setItem(ARMADA_LAST_PHONE_E164_KEY, String(phone).trim());
      } catch (_) {}
      navigation.navigate('OTP', { phone });
    } catch (e) {
      Alert.alert('Error', phoneAuthAlertMessage(e, 'Failed to send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const installWarning = getPhoneAuthInstallWarning();
  const styles = createStyles(theme);
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Armada 🇯🇲</Text>
        <Text style={styles.subtitle}>Bid your price. Ride Armada.</Text>
        <View style={styles.form}>
          <ThemedTextInput
            style={styles.input}
            placeholder="+1 876 123 4567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={theme.colors.textSecondary}
          />
          <AppPressable
            variant="primary"
            theme={theme}
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOTP}
            disabled={loading}
          >
            <View style={styles.buttonRow}>
              {loading ? <ActivityIndicator color={theme.colors.onPrimary} /> : null}
              <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send OTP'}</Text>
            </View>
          </AppPressable>
        </View>
        <View style={styles.legalLinks}>
          <Text style={styles.legalText}>By continuing, you agree to our </Text>
          <AppPressable variant="list" theme={theme} onPress={() => navigation.navigate('PrivacyPolicy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </AppPressable>
          <Text style={styles.legalText}> and </Text>
          <AppPressable variant="list" theme={theme} onPress={() => navigation.navigate('Terms')}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </AppPressable>
          <Text style={styles.legalText}>.</Text>
        </View>
        <Text style={styles.buildStamp} selectable>
          Store build: {getNativeAppBuildLabel()}
        </Text>
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
    marginBottom: 20,
  },
  updateBanner: {
    backgroundColor: theme.colors.error + '18',
    borderWidth: 1,
    borderColor: theme.colors.error + '55',
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 16,
  },
  updateBannerText: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text,
    fontWeight: '600',
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
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
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
  buildStamp: {
    marginTop: 16,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
