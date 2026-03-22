import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AdminGate from '../components/AdminGate';
import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import EarningsScreen from '../screens/driver/EarningsScreen';
import FleetScreen from '../screens/driver/FleetScreen';
import GoldTierScreen from '../screens/driver/GoldTierScreen';
import CorporateGigsScreen from '../screens/driver/CorporateGigsScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';
import DriverTrainingScreen from '../screens/driver/DriverTrainingScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

export default function DriverTabs() {
  const { theme } = useTheme();
  const { logout, userProfile, switchRole } = useAuth();
  const rootNav = useNavigation();
  const roles = userProfile?.roles || (userProfile?.role ? [userProfile.role] : []);
  const canSwitchToRider = roles.includes('rider');
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'car',
            Fleet: 'car-sport',
            Earnings: 'wallet',
            GoldTier: 'star',
            Corporate: 'business',
            Training: 'school',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.orange,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.white },
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitle: route.name === 'Dashboard' ? () => <AdminGate /> : undefined,
        headerLeft: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16, gap: 12 }}>
            {canSwitchToRider && (
              <TouchableOpacity
                onPress={() => switchRole('rider')}
                style={{ backgroundColor: 'rgba(255,255,255,0.25)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 }}
              >
                <Text style={{ color: theme.colors.white, fontSize: 13, fontWeight: '600' }}>Switch to Rider</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => rootNav.navigate('Settings')}>
              <Ionicons name="settings-outline" size={24} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
        ),
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={{ color: theme.colors.onPrimary, fontSize: 14 }}>Logout</Text>
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DriverDashboardScreen} options={{ title: 'Armada Driver' }} />
      <Tab.Screen name="Fleet" component={FleetScreen} options={{ title: 'My Fleet' }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      <Tab.Screen name="GoldTier" component={GoldTierScreen} options={{ title: 'Gold Tier' }} />
      <Tab.Screen name="Corporate" component={CorporateGigsScreen} options={{ title: 'Corporate' }} />
      <Tab.Screen name="Training" component={DriverTrainingScreen} options={{ title: 'Training' }} />
      <Tab.Screen name="Profile" component={DriverProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
