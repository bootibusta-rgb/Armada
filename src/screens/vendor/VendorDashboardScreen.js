import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getVendorMenu } from '../../services/vendorMenuService';
import { withSectionGuide } from '../../components/withSectionGuide';

function VendorDashboardScreen() {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const navigation = useNavigation();
  const [menu, setMenu] = useState([]);
  const sub = userProfile?.vendorSubscription;
  const isActive = sub?.expiresAt && new Date(sub.expiresAt) > new Date();

  const loadMenu = React.useCallback(() => {
    if (userProfile?.id) getVendorMenu(userProfile.id).then(setMenu);
  }, [userProfile?.id]);

  useEffect(() => loadMenu(), [loadMenu]);
  useFocusEffect(loadMenu);

  const styles = createStyles(theme);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{userProfile?.name || 'Vendor'}</Text>
      <Text style={styles.subtitle}>Your food spot is available for riders</Text>

      {!isActive && (
        <TouchableOpacity
          style={styles.premiumBanner}
          onPress={() => navigation.navigate('Premium')}
        >
          <Ionicons name="card" size={24} color={theme.colors.white} />
          <View style={styles.premiumBannerText}>
            <Text style={styles.premiumBannerTitle}>Subscribe to Premium</Text>
            <Text style={styles.premiumBannerSub}>From J$1,000/week – pay to list on Armada</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.white} />
        </TouchableOpacity>
      )}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Menu</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Menu')}>
            <Text style={styles.manageLink}>Manage</Text>
          </TouchableOpacity>
        </View>
        {menu.length === 0 ? (
          <Text style={styles.emptyMenu}>No menu items. Tap Manage to add items and prices.</Text>
        ) : (
          menu.map((item) => (
            <View key={item.id} style={styles.menuRow}>
              <Text style={styles.menuItem}>• {item.name}</Text>
              <Text style={styles.menuPrice}>J${item.price ?? 0}</Text>
            </View>
          ))
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location</Text>
        <Text style={styles.detail}>
          {userProfile?.address || 'Kingston, Jamaica'}
        </Text>
        <Text style={styles.coords}>
          {userProfile?.lat}, {userProfile?.lng}
        </Text>
      </View>
      <Text style={styles.hint}>
        Riders can add your spot as a food stop when booking rides. Orders will appear here when drivers accept.
      </Text>
    </View>
  );
}

export default withSectionGuide(VendorDashboardScreen, 'vendor_dashboard');

const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.orangeDark,
  },
  premiumBannerText: { flex: 1, marginLeft: 12 },
  premiumBannerTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.white },
  premiumBannerSub: { fontSize: 12, color: theme.colors.white, opacity: 0.9, marginTop: 2 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  manageLink: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  menuItem: { fontSize: 16, color: theme.colors.text, flex: 1 },
  menuPrice: { fontSize: 14, color: theme.colors.accent, fontWeight: '600' },
  emptyMenu: { fontSize: 14, color: theme.colors.textSecondary, fontStyle: 'italic' },
  detail: { fontSize: 16, color: theme.colors.text },
  coords: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  hint: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 22,
  },
});
