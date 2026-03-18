import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AdminGate from '../components/AdminGate';
import VendorDashboardScreen from '../screens/vendor/VendorDashboardScreen';
import VendorMenuScreen from '../screens/vendor/VendorMenuScreen';
import VendorOrdersScreen from '../screens/vendor/VendorOrdersScreen';
import VendorSubscriptionScreen from '../screens/vendor/VendorSubscriptionScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

export default function VendorTabs() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const rootNav = useNavigation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'restaurant',
            Menu: 'list',
            Orders: 'receipt',
            Premium: 'card',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.white },
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitle: route.name === 'Dashboard' ? () => <AdminGate /> : undefined,
        headerLeft: () => (
          <TouchableOpacity onPress={() => rootNav.navigate('Settings')} style={{ marginLeft: 16 }}>
            <Ionicons name="settings-outline" size={24} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={{ color: theme.colors.onPrimary, fontSize: 14 }}>Logout</Text>
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={VendorDashboardScreen} options={{ title: 'Armada Vendor' }} />
      <Tab.Screen name="Menu" component={VendorMenuScreen} options={{ title: 'Menu' }} />
      <Tab.Screen name="Orders" component={VendorOrdersScreen} options={{ title: 'Orders' }} />
      <Tab.Screen name="Premium" component={VendorSubscriptionScreen} options={{ title: 'Premium' }} />
    </Tab.Navigator>
  );
}
