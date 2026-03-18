import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function RoleSelectScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const demo = route.params?.demo;

  const selectRole = (role) => {
    if (demo) {
      navigation.navigate(`${role.charAt(0).toUpperCase() + role.slice(1)}Form`, { role, demo: true });
    } else {
      navigation.navigate(`${role.charAt(0).toUpperCase() + role.slice(1)}Form`, { role });
    }
  };

  const cardColors = {
    rider: { border: theme.colors.success, bg: isDark ? theme.colors.surface : '#F0FDF4' },
    driver: { border: theme.colors.accent, bg: isDark ? theme.colors.surface : '#FFF7ED' },
    corporate: { border: theme.colors.primary, bg: isDark ? theme.colors.surface : '#FAF5FF' },
    vendor: { border: theme.colors.accent, bg: isDark ? theme.colors.surface : '#FFF7ED' },
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.colors.primary }]}>Choose your role</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Complete the form for your role</Text>
      <TouchableOpacity
        style={[styles.card, { borderColor: cardColors.rider.border, backgroundColor: cardColors.rider.bg }]}
        onPress={() => selectRole('rider')}
      >
        <Text style={styles.emoji}>🚗</Text>
        <Text style={[styles.cardTitle, { color: theme.colors.success }]}>Rider</Text>
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>Book rides, bid your price, pay cash or card</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.card, { borderColor: cardColors.driver.border, backgroundColor: cardColors.driver.bg }]}
        onPress={() => selectRole('driver')}
      >
        <Text style={styles.emoji}>🛞</Text>
        <Text style={[styles.cardTitle, { color: theme.colors.accent }]}>Driver</Text>
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>Accept bids, earn, Gold Tier & corporate gigs</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.card, { borderColor: cardColors.corporate.border, backgroundColor: cardColors.corporate.bg }]}
        onPress={() => selectRole('corporate')}
      >
        <Text style={styles.emoji}>🏢</Text>
        <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>Corporate</Text>
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>Book staff rides, set shifts, monthly sub</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.card, { borderColor: cardColors.vendor.border, backgroundColor: cardColors.vendor.bg }]}
        onPress={() => selectRole('vendor')}
      >
        <Text style={styles.emoji}>🍗</Text>
        <Text style={[styles.cardTitle, { color: theme.colors.accent }]}>Vendor</Text>
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>List your food spot for riders to pick up</Text>
      </TouchableOpacity>
      {demo && <Text style={[styles.demoNote, { color: theme.colors.textSecondary }]}>Demo mode – using fake data</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  demoNote: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 12,
  },
});
