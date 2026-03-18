// Expo config - reads from .env (EXPO_PUBLIC_* vars)
// Copy .env.example to .env and fill your keys
export default {
  expo: {
    name: 'Armada',
    slug: 'armada',
    version: '1.0.0',
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
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || 'YOUR_GOOGLE_MAPS_ANDROID_KEY',
        },
      },
    },
    plugins: [
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Allow Armada to use your location for ride tracking and matching.',
        },
      ],
      [
        'expo-av',
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
