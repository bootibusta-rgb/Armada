import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AdminGate from '../components/AdminGate';
import CarRentalDashboardScreen from '../screens/carRental/CarRentalDashboardScreen';
import CarRentalRequestOwnerScreen from '../screens/carRental/CarRentalRequestOwnerScreen';
import RentalChatScreen from '../screens/shared/RentalChatScreen';
import CarRentalListingScreen from '../screens/carRental/CarRentalListingScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function CarRentalStack() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const rootNav = useNavigation();
  const headerOptions = {
    headerStyle: { backgroundColor: theme.colors.primary },
    headerTintColor: theme.colors.onPrimary,
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
  };
  return (
    <Stack.Navigator screenOptions={{ headerShown: true, ...headerOptions }}>
      <Stack.Screen
        name="MyRentalsHome"
        component={CarRentalDashboardScreen}
        options={{
          title: 'My Rentals',
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AdminGate />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="CarRentalRequestOwner"
        component={CarRentalRequestOwnerScreen}
        options={{ title: 'Request', headerShown: false }}
      />
      <Stack.Screen
        name="RentalChat"
        component={RentalChatScreen}
        options={{ title: 'Rental chat', headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function CarRentalTabs() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const rootNav = useNavigation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icon =
            route.name === 'Listing'
              ? 'cash-outline'
              : 'car-sport-outline';
          return <Ionicons name={icon} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.white },
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
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
      <Tab.Screen name="MyRentals" component={CarRentalStack} options={{ title: 'Car Rental', headerShown: false }} />
      <Tab.Screen
        name="Listing"
        component={CarRentalListingScreen}
        options={{ title: 'Listing fee', headerShown: true }}
      />
    </Tab.Navigator>
  );
}
