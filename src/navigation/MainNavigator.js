import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import RiderTabs from './RiderTabs';
import DriverTabs from './DriverTabs';
import CorporateTabs from './CorporateTabs';
import VendorTabs from './VendorTabs';
import CarRentalTabs from './CarRentalTabs';
import AdminScreen from '../screens/admin/AdminScreen';
import SettingsScreen from '../screens/shared/SettingsScreen';
import SectionGuidesHubScreen from '../screens/shared/SectionGuidesHubScreen';
import RiderFormScreen from '../screens/auth/RiderFormScreen';
import DriverFormScreen from '../screens/auth/DriverFormScreen';
import DriverActiveRideScreen from '../screens/driver/DriverActiveRideScreen';
import RideChatScreen from '../screens/shared/RideChatScreen';
import EmergencyVideoCallScreen from '../screens/rider/EmergencyVideoCallScreen';
import PresenceUpdater from '../components/PresenceUpdater';
import EmergencyCallReceiver from '../components/EmergencyCallReceiver';
import NotificationsButton from '../components/NotificationsButton';

const Stack = createNativeStackNavigator();

export default function MainNavigator({ userProfile, demoMode }) {
  const { theme } = useTheme();
  const role = userProfile?.role || 'rider';
  const Tabs = role === 'corporate' ? CorporateTabs
    : role === 'driver' ? DriverTabs
    : role === 'vendor' ? VendorTabs
    : role === 'carRental' ? CarRentalTabs
    : RiderTabs;

  const headerOptions = {
    headerStyle: { backgroundColor: theme.colors.primary },
    headerTintColor: theme.colors.onPrimary,
  };

  return (
    <View style={{ flex: 1 }}>
      {!demoMode && <PresenceUpdater userId={userProfile?.id} />}
      {!demoMode && <EmergencyCallReceiver />}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="DriverActiveRide" component={DriverActiveRideScreen} options={{ headerShown: true, title: 'Active Ride', ...headerOptions }} />
        <Stack.Screen name="RideChat" component={RideChatScreen} options={{ headerShown: true, title: 'Chat', ...headerOptions }} />
        <Stack.Screen name="EmergencyVideoCall" component={EmergencyVideoCallScreen} options={{ headerShown: false, title: 'Video Call' }} />
        <Stack.Screen
          name="Admin"
          component={AdminScreen}
          options={{
            headerShown: true,
            title: 'Admin',
            ...headerOptions,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: true,
            title: 'Settings',
            ...headerOptions,
          }}
        />
        <Stack.Screen
          name="SectionGuidesHub"
          component={SectionGuidesHubScreen}
          options={{
            headerShown: true,
            title: 'Section guides',
            ...headerOptions,
          }}
        />
        <Stack.Screen name="RiderForm" component={RiderFormScreen} options={{ headerShown: true, title: 'Rider Profile', ...headerOptions }} />
        <Stack.Screen name="DriverForm" component={DriverFormScreen} options={{ headerShown: true, title: 'Driver Profile', ...headerOptions }} />
      </Stack.Navigator>
      <NotificationsButton userProfile={userProfile} />
    </View>
  );
}

