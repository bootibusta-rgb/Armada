import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import PhoneAuthScreen from '../screens/auth/PhoneAuthScreen';
import OTPScreen from '../screens/auth/OTPScreen';
import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import RiderFormScreen from '../screens/auth/RiderFormScreen';
import DriverFormScreen from '../screens/auth/DriverFormScreen';
import CorporateFormScreen from '../screens/auth/CorporateFormScreen';
import VendorFormScreen from '../screens/auth/VendorFormScreen';
import CarRentalFormScreen from '../screens/auth/CarRentalFormScreen';
import PrivacyPolicyScreen from '../screens/legal/PrivacyPolicyScreen';
import TermsScreen from '../screens/legal/TermsScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} options={{ title: 'Armada' }} />
      <Stack.Screen name="OTP" component={OTPScreen} options={{ title: 'Verify' }} />
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} options={{ title: 'Choose Role' }} />
      <Stack.Screen name="RiderForm" component={RiderFormScreen} options={{ title: 'Rider' }} />
      <Stack.Screen name="DriverForm" component={DriverFormScreen} options={{ title: 'Driver' }} />
      <Stack.Screen name="CorporateForm" component={CorporateFormScreen} options={{ title: 'Corporate' }} />
      <Stack.Screen name="VendorForm" component={VendorFormScreen} options={{ title: 'Vendor' }} />
      <Stack.Screen name="CarRentalForm" component={CarRentalFormScreen} options={{ title: 'Car Rental' }} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms of Service' }} />
    </Stack.Navigator>
  );
}
