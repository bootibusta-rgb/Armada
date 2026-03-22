import './src/config/sentry';
import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';

if (__DEV__) {
  LogBox.ignoreLogs([/event-target-shim/i]);
}
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { initAnalytics } from './src/services/analyticsService';
import { addNotificationResponseListener } from './src/services/notificationService';
import ErrorBoundary from './src/components/ErrorBoundary';

const linking = {
  prefixes: ['armada://', 'https://armada.app'],
  config: {
    screens: {
      Main: {
        path: '',
        screens: {
          Home: {
            path: 'home',
            screens: {
              RiderHome: '',
              RideReceipt: 'ride/:rideId/receipt',
            },
          },
        },
      },
    },
  },
};

function AppContent() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      const rideId = data?.rideId || data?.ride_id;
      const requestId = data?.requestId;
      const type = data?.type;
      if (!navigationRef.isReady()) return;
      if (type === 'car_rental_request' && requestId) {
        navigationRef.navigate('Main', {
          screen: 'MyRentals',
          params: {
            screen: 'CarRentalRequestOwner',
            params: { requestId },
          },
        });
        return;
      }
      if (rideId) {
        navigationRef.navigate('Main', {
          screen: 'Home',
          params: {
            screen: 'RideReceipt',
            params: { rideId, fromNotification: true },
          },
        });
      }
    });
    return () => sub?.remove();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <NavigationContainer ref={navigationRef} linking={linking}>
            <AppContent />
          </NavigationContainer>
        </ErrorBoundary>
      </ThemeProvider>
    </AuthProvider>
  );
}
