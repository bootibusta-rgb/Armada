import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getCompanyRides } from '../../services/corporateService';
import { useTheme } from '../../context/ThemeContext';
import { withSectionGuide } from '../../components/withSectionGuide';

function CorporateInvoiceScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [rides, setRides] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (userProfile?.id) {
      getCompanyRides(userProfile.id).then((list) => {
        const filtered = list.filter((r) => {
          const d = r.completedAt ? new Date(r.completedAt) : null;
          return d && d.getMonth() === month && d.getFullYear() === year;
        });
        setRides(filtered);
      });
    }
  }, [userProfile?.id, month, year]);

  const total = rides.reduce((s, r) => s + (r.finalFare || r.bidPrice || 0), 0);

  const handleShare = async () => {
    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
    const lines = rides.map((r) => `${r.pickup || '—'} → ${r.dropoff || '—'} | J$${r.finalFare || r.bidPrice || 0}`);
    const msg = `Armada Corporate Invoice - ${monthName} ${year}\n${userProfile?.name || 'Company'}\n\n${lines.join('\n')}\n\nTotal: J$${total.toLocaleString()}`;
    await Share.share({ message: msg, title: 'Corporate Invoice' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Monthly Invoice</Text>
      <Text style={styles.subtitle}>{userProfile?.name || 'Company'}</Text>
      <View style={styles.summary}>
        <Text style={styles.totalLabel}>Total ({rides.length} rides)</Text>
        <Text style={styles.total}>J${total.toLocaleString()}</Text>
      </View>
      {rides.map((r, i) => (
        <View key={r.id || i} style={styles.row}>
          <Text style={styles.rowRoute} numberOfLines={1}>{r.pickup || '—'} → {r.dropoff || '—'}</Text>
          <Text style={styles.rowFare}>J${(r.finalFare || r.bidPrice || 0).toLocaleString()}</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Ionicons name="share-social" size={22} color={theme.colors.onPrimary} />
        <Text style={styles.shareText}>Share invoice</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default withSectionGuide(CorporateInvoiceScreen, 'corporate_invoice');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
  summary: { backgroundColor: theme.colors.surface, padding: 20, borderRadius: 12, marginBottom: 20, borderWidth: 2, borderColor: theme.colors.primaryLight },
  totalLabel: { fontSize: 14, color: theme.colors.textSecondary },
  total: { fontSize: 28, fontWeight: 'bold', color: theme.colors.primary, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.surface },
  rowRoute: { flex: 1, fontSize: 14, color: theme.colors.text },
  rowFare: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, marginTop: 24 },
  shareText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
});
