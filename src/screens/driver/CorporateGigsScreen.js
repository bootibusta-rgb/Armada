import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { subscribeToDriverShifts, acceptShift } from '../../services/corporateService';
import { useAuth } from '../../context/AuthContext';
import { isFirebaseReady } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';

export default function CorporateGigsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseReady) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToDriverShifts((firebaseShifts) => {
      setShifts(
        firebaseShifts.map((s) => ({
          id: s.id,
          company: s.companyName || 'Company',
          timeRange: s.timeRange,
          rideCount: s.rideCount,
          farePerRide: s.farePerRide,
          total: (s.rideCount || 0) * (s.farePerRide || 0),
        }))
      );
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleAccept = async (shift) => {
    if (!isFirebaseReady) {
      Alert.alert('Offline', 'Firebase not configured');
      return;
    }
    try {
      await acceptShift(shift.id, userProfile?.id);
      Alert.alert('Accepted', `You're assigned to ${shift.company} - ${shift.timeRange}`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not accept shift');
    }
  };

  const handleReject = (shift) => {
    Alert.alert('Rejected', `Declined ${shift.company} shift`);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Corporate shifts</Text>
      <Text style={styles.subtitle}>Gold Tier drivers get priority</Text>
      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No open shifts</Text>
            <Text style={styles.emptySub}>Check back later for corporate gigs</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.company}>{item.company}</Text>
            <Text style={styles.time}>{item.timeRange}</Text>
            <Text style={styles.detail}>
              {item.rideCount} rides @ J${item.farePerRide}/ride = J${item.total}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(item)}>
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item)}>
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  emptyCard: {
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.textSecondary },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  company: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  time: { fontSize: 16, color: theme.colors.accent, marginTop: 4 },
  detail: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  rejectBtn: {
    flex: 1,
    backgroundColor: theme.colors.error,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: theme.colors.success,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
});
