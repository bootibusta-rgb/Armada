import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCorporateStats } from '../../services/corporateService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isFirebaseReady } from '../../config/firebase';
import { withSectionGuide } from '../../components/withSectionGuide';

const ACTION_BUTTONS = [
  { key: 'Book', label: 'Book ride', icon: 'car', color: '#7C3AED', route: 'Book' },
  { key: 'Employees', label: 'Employees', icon: 'people', color: '#0EA5E9', route: 'Employees' },
  { key: 'Shifts', label: 'Shifts', icon: 'calendar', color: '#F97316', route: 'Shifts' },
  { key: 'Subscription', label: 'Subscription', icon: 'card', color: '#22C55E', route: 'Subscription' },
  { key: 'Invoice', label: 'Invoice', icon: 'receipt', color: '#0EA5E9', route: 'Invoice' },
];

function CorporateDashboardScreen() {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!isFirebaseReady || !userProfile?.id) return;
    try {
      const data = await getCorporateStats(userProfile.id);
      setStats(data);
    } catch (e) {
      setStats({
        assignedDrivers: 0,
        ridesThisMonth: 0,
        ridesThisWeek: 0,
        costSavings: 0,
        averageFare: 0,
        topDepartments: [],
        recentRides: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userProfile?.id]);

  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id) {
      setLoading(false);
      return;
    }
    loadStats();
  }, [userProfile?.id, loadStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStats();
  }, [loadStats]);

  const styles = createStyles(theme);
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const ridesThisWeek = stats?.ridesThisWeek ?? 0;
  const ridesThisMonth = stats?.ridesThisMonth ?? 0;
  const averageFare = stats?.averageFare ?? 0;
  const topDepartments = stats?.topDepartments ?? [];
  const costSavings = stats?.costSavings ?? 0;
  const assignedDrivers = stats?.assignedDrivers ?? 0;
  const recentRides = stats?.recentRides ?? [];

  const navigation = useNavigation();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Corporate Dashboard</Text>
      <Text style={styles.subtitle}>{userProfile?.name || 'Company'}</Text>

      {/* CEO-friendly stats at a glance */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardHighlight]}>
          <Ionicons name="car" size={28} color="#7C3AED" />
          <Text style={styles.statValue}>{ridesThisWeek}</Text>
          <Text style={styles.statLabel}>Rides this week</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="cash" size={28} color="#22C55E" />
          <Text style={styles.statValue}>J${averageFare?.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Avg. fare</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="trending-down" size={28} color="#0EA5E9" />
          <Text style={styles.statValue}>J${costSavings?.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Savings vs taxi</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="calendar" size={28} color="#F97316" />
          <Text style={styles.statValue}>{ridesThisMonth}</Text>
          <Text style={styles.statLabel}>Rides this month</Text>
        </View>
      </View>

      {/* Top departments */}
      {topDepartments.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Top departments</Text>
          {topDepartments.map((d, i) => (
            <View key={d.name} style={styles.deptRow}>
              <Text style={styles.deptRank}>{i + 1}.</Text>
              <Text style={styles.deptName}>{d.name}</Text>
              <Text style={styles.deptCount}>{d.count} rides</Text>
            </View>
          ))}
        </View>
      )}

      {/* Dynamic action buttons with unique colors */}
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.buttonsGrid}>
        {ACTION_BUTTONS.map((btn) => (
          <TouchableOpacity
            key={btn.key}
            style={[styles.actionBtn, { backgroundColor: btn.color }]}
            onPress={() => navigation.navigate(btn.route)}
            activeOpacity={0.85}
          >
            <Ionicons name={btn.icon} size={26} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Assigned drivers */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Assigned drivers</Text>
        <Text style={styles.cardValue}>{assignedDrivers}</Text>
      </View>

      {/* Recent ride logs */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recent ride logs</Text>
        {recentRides.length === 0 ? (
          <Text style={styles.empty}>No rides yet</Text>
        ) : (
          recentRides.map((r, i) => {
            const d = r.completedAt ? new Date(r.completedAt) : null;
            const dateStr = d ? d.toLocaleDateString('en-JM', { month: 'short', day: 'numeric' }) : '—';
            const driverName = r.driverName || 'Driver';
            return (
              <Text key={r.id || i} style={styles.rideLog}>
                {dateStr} – {driverName} – {r.pickup || '?'} to {r.dropoff || '?'} – J${r.finalFare || r.bidPrice || 0}
              </Text>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

export default withSectionGuide(CorporateDashboardScreen, 'corporate_dashboard');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 32 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, padding: 24, paddingBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.textSecondary, paddingHorizontal: 24, marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
  },
  statCardHighlight: {
    borderColor: theme.colors.primaryLight,
    borderWidth: 2,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: theme.colors.primary, marginTop: 8 },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  buttonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
  },
  actionBtn: {
    width: '47%',
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  card: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 0,
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardLabel: { fontSize: 14, color: theme.colors.textSecondary },
  cardValue: { fontSize: 28, fontWeight: 'bold', color: theme.colors.primary, marginTop: 4 },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  deptRank: { fontSize: 14, fontWeight: 'bold', color: theme.colors.primary, width: 20 },
  deptName: { flex: 1, fontSize: 15, color: theme.colors.text },
  deptCount: { fontSize: 14, color: theme.colors.textSecondary },
  rideLog: { fontSize: 14, color: theme.colors.text, marginTop: 8 },
  empty: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
});
