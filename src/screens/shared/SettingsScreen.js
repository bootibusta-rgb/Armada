import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { isSentryEnabled } from '../../config/sentry';
import { isProductionApp } from '../../config/appEnv';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { SECTION_GUIDE_FAB_HIDDEN_KEY } from '../../constants/sectionGuidePrefs';

export default function SettingsScreen({ navigation }) {
  const { theme, mode, setThemeMode, hasProfile } = useTheme();
  const { userProfile, switchRole, refreshUserProfile } = useAuth();
  const [showFloatingHelp, setShowFloatingHelp] = useState(true);
  const roles = userProfile?.roles || (userProfile?.role ? [userProfile.role] : []);
  const canToggleDriverRider = roles.includes('rider') && roles.includes('driver');
  const currentRole = userProfile?.role || 'rider';

  useFocusEffect(
    useCallback(() => {
      refreshUserProfile();
      AsyncStorage.getItem(SECTION_GUIDE_FAB_HIDDEN_KEY).then((v) => {
        setShowFloatingHelp(v !== '1');
      });
    }, [refreshUserProfile])
  );

  const onToggleFloatingHelp = async (value) => {
    setShowFloatingHelp(value);
    try {
      if (value) {
        await AsyncStorage.removeItem(SECTION_GUIDE_FAB_HIDDEN_KEY);
      } else {
        await AsyncStorage.setItem(SECTION_GUIDE_FAB_HIDDEN_KEY, '1');
      }
    } catch {
      /* ignore */
    }
  };

  const testSentry = () => {
    if (!isSentryEnabled) {
      Alert.alert('Sentry', 'Set EXPO_PUBLIC_SENTRY_DSN in .env to enable crash reporting.');
      return;
    }
    try {
      Sentry.captureMessage(`Armada Sentry test – ${new Date().toISOString()}`, 'info');
      Sentry.captureException(new Error('Test exception – Armada Sentry check'));
      Alert.alert('Sentry Test', 'Test events sent. Check your Sentry dashboard in a few seconds.');
    } catch (e) {
      Alert.alert('Sentry Error', e?.message || 'Sentry failed to send');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Settings</Text>
      {roles.includes('rider') && !roles.includes('driver') && (
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Add driver profile</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Get verified as a driver to accept rides and earn</Text>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('DriverForm', {})}>
            <Ionicons name="car" size={24} color={theme.colors.accent} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Verify as driver</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      {roles.includes('driver') && !roles.includes('rider') && (
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Add rider profile</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Get verified as a rider to book rides</Text>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('RiderForm', {})}>
            <Ionicons name="person" size={24} color={theme.colors.success} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Verify as rider</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      {canToggleDriverRider && (
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Switch role</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>You're verified as both rider and driver</Text>
          <TouchableOpacity
            style={[styles.row, currentRole === 'rider' && styles.rowActive]}
            onPress={() => switchRole('rider')}
          >
            <Ionicons name="person" size={24} color={theme.colors.success} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Rider</Text>
            {currentRole === 'rider' && <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, currentRole === 'driver' && styles.rowActive]}
            onPress={() => switchRole('driver')}
          >
            <Ionicons name="car" size={24} color={theme.colors.accent} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Driver</Text>
            {currentRole === 'driver' && <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />}
          </TouchableOpacity>
        </View>
      )}
      {hasProfile && (
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Help</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
            Turn off the floating ? button on Home, Coins, and other main tabs if it gets in your way. You can always read guides here.
          </Text>
          <View style={[styles.row, styles.switchRow]}>
            <Ionicons name="help-circle-outline" size={24} color={theme.colors.primary} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Show floating help on screens</Text>
            <Switch
              value={showFloatingHelp}
              onValueChange={onToggleFloatingHelp}
              trackColor={{ false: theme.colors.textSecondary + '60', true: theme.colors.primary + '99' }}
              thumbColor={showFloatingHelp ? theme.colors.primary : theme.colors.surface}
            />
          </View>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SectionGuidesHub')}>
            <Ionicons name="book-outline" size={24} color={theme.colors.accent} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Section guides</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      {hasProfile && (
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Appearance</Text>
          <TouchableOpacity
            style={[styles.row, mode === 'light' && styles.rowActive]}
            onPress={() => setThemeMode('light')}
          >
            <Ionicons name="sunny" size={24} color={theme.colors.accent} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Light</Text>
            {mode === 'light' && <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, mode === 'dark' && styles.rowActive]}
            onPress={() => setThemeMode('dark')}
          >
            <Ionicons name="moon" size={24} color={theme.colors.primary} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>Dark</Text>
            {mode === 'dark' && <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, mode === 'system' && styles.rowActive]}
            onPress={() => setThemeMode('system')}
          >
            <Ionicons name="phone-portrait" size={24} color={theme.colors.textSecondary} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>System</Text>
            {mode === 'system' && <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />}
          </TouchableOpacity>
        </View>
      )}
      {(!isProductionApp || isSentryEnabled) && (
        <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight, marginHorizontal: 24 }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Developer</Text>
          <TouchableOpacity style={[styles.row]} onPress={testSentry}>
            <Ionicons name="bug" size={24} color={theme.colors.accent} />
            <Text style={[styles.rowText, { color: theme.colors.text }]}>
              {isSentryEnabled ? 'Test Sentry' : 'Sentry (not configured)'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={[styles.backText, { color: theme.colors.textSecondary }]}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', padding: 24, paddingBottom: 8 },
  section: { marginHorizontal: 24, marginBottom: 24, borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  sectionTitle: { fontSize: 16, fontWeight: '600', padding: 16, paddingBottom: 8 },
  sectionSubtitle: { fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  rowActive: { backgroundColor: 'rgba(124, 58, 237, 0.1)' },
  rowText: { flex: 1, fontSize: 16 },
  switchRow: { justifyContent: 'space-between', gap: 8 },
  backBtn: { padding: 24, alignItems: 'center' },
  backText: { fontSize: 16 },
});
