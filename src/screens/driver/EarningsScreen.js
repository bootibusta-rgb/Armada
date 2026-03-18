import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { getDriverEarnings } from '../../services/earningsService';
import { isFirebaseReady } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';

export default function EarningsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [period, setPeriod] = useState('week');
  const [earnings, setEarnings] = useState(null);

  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id) return;
    const load = async () => {
      try {
        const data = await getDriverEarnings(userProfile.id, period);
        setEarnings(data);
      } catch (e) {
        setEarnings({ gross: 0, platformCut: 0, takeHome: 0, rideCount: 0 });
      }
    };
    load();
  }, [period, userProfile?.id]);

  const isEmpty = !earnings || earnings.rideCount === 0;

  return (
    <View style={styles.container}>
      <View style={styles.periodRow}>
        <TouchableOpacity
          style={[styles.periodBtn, period === 'day' && styles.periodBtnActive]}
          onPress={() => setPeriod('day')}
        >
          <Text style={[styles.periodText, period === 'day' && styles.periodTextActive]}>Daily</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodBtn, period === 'week' && styles.periodBtnActive]}
          onPress={() => setPeriod('week')}
        >
          <Text style={[styles.periodText, period === 'week' && styles.periodTextActive]}>Weekly</Text>
        </TouchableOpacity>
      </View>
      {isEmpty ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No earnings yet</Text>
          <Text style={styles.emptySub}>Complete rides to see your take-home and platform fee</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Take-home (after 20% cut)</Text>
            <Text style={styles.takeHome}>J${earnings.takeHome?.toLocaleString() ?? '0'}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Gross earnings</Text>
            <Text style={styles.gross}>J${earnings.gross?.toLocaleString() ?? '0'}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Platform fee (20%)</Text>
            <Text style={styles.fee}>J${earnings.platformCut?.toLocaleString() ?? '0'}</Text>
          </View>
          <Text style={styles.rides}>{earnings.rideCount ?? 0} rides completed</Text>
          {earnings.rides?.length > 0 && (
            <View style={styles.breakdownSection}>
              <Text style={styles.breakdownTitle}>Per-ride breakdown</Text>
              {earnings.rides.slice(0, 15).map((r, i) => {
                const fare = r.finalFare || r.bidPrice || 0;
                const cut = fare * 0.2;
                const net = fare - cut;
                return (
                  <View key={r.id || i} style={styles.rideRow}>
                    <Text style={styles.rideRoute} numberOfLines={1}>{r.pickup || '—'} → {r.dropoff || '—'}</Text>
                    <Text style={styles.rideFare}>J${fare} (−J${Math.round(cut)}) = J${Math.round(net)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24 },
  periodRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  periodBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  periodBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.secondary },
  periodText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  periodTextActive: { color: theme.colors.onPrimary },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  label: { fontSize: 14, color: theme.colors.textSecondary },
  takeHome: { fontSize: 32, fontWeight: 'bold', color: theme.colors.success, marginTop: 4 },
  gross: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginTop: 4 },
  fee: { fontSize: 20, fontWeight: 'bold', color: theme.colors.accent, marginTop: 4 },
  rides: { textAlign: 'center', marginTop: 16, color: theme.colors.textSecondary },
  emptyCard: {
    marginTop: 24,
    padding: 32,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.textSecondary },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center' },
  breakdownSection: { marginTop: 24, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, borderWidth: 2, borderColor: theme.colors.primaryLight },
  breakdownTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 12 },
  rideRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.background },
  rideRoute: { fontSize: 13, color: theme.colors.text },
  rideFare: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});
