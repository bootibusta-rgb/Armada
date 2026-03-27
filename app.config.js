// Expo config - reads from .env (EXPO_PUBLIC_* vars)
// Copy .env.example to .env and fill your keys
export default {
  expo: {
    name: 'Armada',
    slug: 'armada',
    scheme: 'armada',
    version: '1.0.0',
    description: 'Bid your price. Ride Armada. Jamaican ride-share with cash or card.',
    extra: {
      eas: {
        projectId: '9d9722fe-1abf-4aea-9bb1-5bd432c3384f',
      },
      privacyPolicyUrl: 'https://armada-25d8a.web.app/privacy.html',
      termsUrl: 'https://armada-25d8a.web.app/terms.html',
    },
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#7C3AED',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.armada.app',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || 'YOUR_GOOGLE_MAPS_IOS_KEY',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#7C3AED',
      },
      package: 'com.armada.app',
      googleServicesFile: './google-services.json',
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || 'YOUR_GOOGLE_MAPS_ANDROID_KEY',
        },
      },
    },
    plugins: [
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      [
        'expo-build-properties',
        { ios: { useFrameworks: 'static' } },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Allow Armada to use your location for ride tracking and matching.',
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission: 'Allow Armada to use your microphone for voice bidding.',
        },
      ],
      [
        'expo-contacts',
        {
          contactsPermission: 'Allow Armada to access contacts to select emergency contacts.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#7C3AED',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Armada to access your photos to upload vehicle images.',
          cameraPermission: 'Allow Armada to use the camera for vehicle photos.',
        },
      ],
      '@config-plugins/react-native-webrtc',
    ],
  },
};
