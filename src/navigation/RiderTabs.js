import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AdminGate from '../components/AdminGate';
import RiderHomeScreen from '../screens/rider/RiderHomeScreen';
import BiddingScreen from '../screens/rider/BiddingScreen';
import ActiveRideScreen from '../screens/rider/ActiveRideScreen';
import PaymentScreen from '../screens/rider/PaymentScreen';
import RideChatScreen from '../screens/shared/RideChatScreen';
import EmergencyVideoCallScreen from '../screens/rider/EmergencyVideoCallScreen';
import IrieCoinsScreen from '../screens/rider/IrieCoinsScreen';
import EmergencyContactsScreen from '../screens/rider/EmergencyContactsScreen';
import EmergencyCallScreen from '../screens/rider/EmergencyCallScreen';
import RideReceiptScreen from '../screens/rider/RideReceiptScreen';
import RentACarScreen from '../screens/rider/RentACarScreen';
import RentalChatScreen from '../screens/shared/RentalChatScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function RiderStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderHome" component={RiderHomeScreen} />
      <Stack.Screen name="Bidding" component={BiddingScreen} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} />
      <Stack.Screen name="RideChat" component={RideChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen name="EmergencyVideoCall" component={EmergencyVideoCallScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EmergencyCall" component={EmergencyCallScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="RideReceipt" component={RideReceiptScreen} options={{ title: 'Receipt' }} />
      <Stack.Screen name="RentACar" component={RentACarScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RentalChat" component={RentalChatScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function RiderTabs() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const rootNav = useNavigation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          const icons = { Home: 'home' };
          // Coins tab: "A" for Armada – coin-style badge
          if (route.name === 'Coins') {
            const isActive = focused;
            return (
              <View
                style={{
                  width: size + 6,
                  height: size + 6,
                  borderRadius: (size + 6) / 2,
                  backgroundColor: isActive ? theme.colors.primary : theme.colors.surface,
                  borderWidth: 2,
                  borderColor: isActive ? theme.colors.secondary : theme.colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: size * 0.75,
                    fontWeight: '800',
                    color: isActive ? theme.colors.secondary : theme.colors.primary,
                    letterSpacing: -0.5,
                  }}
                >
                  A
                </Text>
              </View>
            );
          }
          // Emergency tab: shield in alert-style badge (red accent)
          if (route.name === 'Safety') {
            const isActive = focused;
            return (
              <View
                style={{
                  width: size + 8,
                  height: size + 8,
                  borderRadius: 8,
                  backgroundColor: isActive ? theme.colors.error : theme.colors.surface,
                  borderWidth: 2,
                  borderColor: theme.colors.error,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={size * 0.85}
                  color={isActive ? theme.colors.white : theme.colors.error}
                />
              </View>
            );
          }
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.white },
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitle: route.name === 'Home' ? () => <AdminGate /> : undefined,
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
      <Tab.Screen name="Home" component={RiderStack} options={{ title: 'Armada' }} />
      <Tab.Screen name="Coins" component={IrieCoinsScreen} options={{ title: 'Armada Coins' }} />
      <Tab.Screen name="Safety" component={EmergencyContactsScreen} options={{ title: 'Emergency' }} />
    </Tab.Navigator>
  );
}
