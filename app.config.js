// Expo config - reads from .env (EXPO_PUBLIC_* vars)
// Copy .env.example to .env and fill your keys
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const sentryPlugin =
  sentryOrg && sentryProject
    ? ['@sentry/react-native', { organization: sentryOrg, project: sentryProject }]
    : '@sentry/react-native';

export default {
  expo: {
    name: 'Armada',
    slug: 'armada',
    scheme: 'armada',
    version: '10.12.25',
    /**
     * **Disabled for Play / local release:** avoids loading old JS/assets from an on-device EAS Update
     * (cached OTA can still win at launch when enabled, even with ON_ERROR_RECOVERY).
     * Ship a new AAB/APK for each release; turn `enabled` back on only when you intentionally use OTA again.
     */
    updates: {
      url: 'https://u.expo.dev/9d9722fe-1abf-4aea-9bb1-5bd432c3384f',
      enabled: false,
    },
    description: 'Bid your price. Ride Armada. Jamaican ride-share with cash or card.',
    extra: {
      /**
       * Legacy mirror only — **phone auth does not read this** (see `androidPhoneAuthPolicy.js`).
       * Forced to false so embedded config never re-enables the old duplicate path; use EXPO_PUBLIC_* for opt-in.
       */
      firebaseAndroidPhoneUseRecaptcha: false,
      /** Card / PayPal: set EXPO_PUBLIC_PAYPAL_PAYMENTS_ENABLED=false to hide. Default enabled. */
      paypalPaymentsEnabled: process.env.EXPO_PUBLIC_PAYPAL_PAYMENTS_ENABLED !== 'false',
      eas: {
        projectId: '9d9722fe-1abf-4aea-9bb1-5bd432c3384f',
      },
      privacyPolicyUrl:
        process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || 'https://armada-25d8a.web.app/privacy.html',
      termsUrl: process.env.EXPO_PUBLIC_TERMS_URL?.trim() || 'https://armada-25d8a.web.app/terms.html',
      /** Fallback when Metro inlines miss EXPO_PUBLIC_* — same values app.config reads from .env at startup. */
      googleMapsPlacesWebKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_PLACES_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_GEOCODING_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_DIRECTIONS_KEY ||
        '',
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
      buildNumber: '139',
      runtimeVersion: {
        policy: 'appVersion',
      },
      bundleIdentifier: 'com.armada.ride',
      /** Required by @react-native-firebase/app + auth (prebuild runs iOS plugins even for Android-only EAS builds). */
      googleServicesFile: './GoogleService-Info.plist',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || 'YOUR_GOOGLE_MAPS_IOS_KEY',
      },
      infoPlist: {
        LSApplicationQueriesSchemes: ['waze'],
      },
    },
    android: {
      /** Integer; must increase for each Play upload. */
      versionCode: 56,
      runtimeVersion: '10.12.25',
      /**
       * `resize` lets `KeyboardAvoidingView` / insets work reliably (especially inside `Modal`).
       * `pan` often leaves modal sheets covered by the keyboard on Android.
       */
      softwareKeyboardLayoutMode: 'resize',
      /** Required by react-native-reanimated / worklets; map markers use scaled custom views. */
      newArchEnabled: true,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF',
      },
      package: 'com.armada.ride',
      googleServicesFile: './google-services.json',
      /** Required on Android 13+ for local/push alerts to show and play sound reliably. */
      permissions: ['android.permission.POST_NOTIFICATIONS'],
      // Lets `expo start --dev-client` QR codes (exp://…) open this app instead of doing nothing.
      intentFilters: [
        {
          action: 'VIEW',
          data: [{ scheme: 'exp' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '',
        },
      },
    },
    plugins: [
      // Keeps MainActivity windowSoftInputMode in sync with `android.softwareKeyboardLayoutMode` on prebuild
      './plugins/withAndroidKeyboardSoftInputMode',
      // Injects Maps API key into AndroidManifest at prebuild (literal value, not Gradle placeholder)
      './plugins/withAndroidGoogleMapsKey',
      './plugins/withAndroidPhoneAuthQueries',
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      [
        'expo-build-properties',
        {
          ios: { useFrameworks: 'static' },
          /** Android New Arch: set `expo.android.newArchEnabled` above (not here — deprecated in build-properties). */
        },
      ],
      'expo-font',
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
          defaultChannel: 'armada-alerts',
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
      sentryPlugin,
      /** Writes EAS Update URL + runtime native metadata on prebuild; keep AndroidManifest/strings in sync until next prebuild. */
      'expo-updates',
    ],
  },
};
