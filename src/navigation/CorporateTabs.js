import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AdminGate from '../components/AdminGate';
import CorporateDashboardScreen from '../screens/corporate/CorporateDashboardScreen';
import CorporateBookRideScreen from '../screens/corporate/CorporateBookRideScreen';
import CorporateEmployeesScreen from '../screens/corporate/CorporateEmployeesScreen';
import ShiftsScreen from '../screens/corporate/ShiftsScreen';
import SubscriptionScreen from '../screens/corporate/SubscriptionScreen';
import CorporateInvoiceScreen from '../screens/corporate/CorporateInvoiceScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

export default function CorporateTabs() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const rootNav = useNavigation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'grid',
            Book: 'car',
            Employees: 'people',
            Shifts: 'calendar',
            Subscription: 'card',
            Invoice: 'receipt',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.white },
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitle: route.name === 'Dashboard' ? () => <AdminGate /> : undefined,
        headerLeft: () => (
          <TouchableOpacity onPress={() => rootNav.navigate('Settings')} style={{ marginLeft: 16 }}>
            <Ionicons name="settings-outline" size={24} color={theme.colors.white} />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={{ color: theme.colors.onPrimary, fontSize: 14 }}>Logout</Text>
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={CorporateDashboardScreen} options={{ title: 'Corporate' }} />
      <Tab.Screen name="Book" component={CorporateBookRideScreen} options={{ title: 'Book ride' }} />
      <Tab.Screen name="Employees" component={CorporateEmployeesScreen} options={{ title: 'Employees' }} />
      <Tab.Screen name="Shifts" component={ShiftsScreen} />
      <Tab.Screen name="Subscription" component={SubscriptionScreen} />
      <Tab.Screen name="Invoice" component={CorporateInvoiceScreen} options={{ title: 'Invoice' }} />
    </Tab.Navigator>
  );
}
