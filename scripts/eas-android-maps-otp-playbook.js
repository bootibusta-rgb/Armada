#!/usr/bin/env node
/**
 * Reminder: EAS / Play Android builds use a different signing certificate than debug.
 * Blank Maps + failing OTP usually mean Firebase + GCP key restrictions lack that cert's SHA.*
 */
console.log(`
EAS Android — Maps + phone auth checklist
=========================================

Both features need the SAME package (com.armada.ride) and the SHA fingerprints of the
.keystore used to SIGN the binary you installed from expo.dev.

1) Get fingerprints from Expo
   • https://expo.dev → Your project → Credentials → Android
   • Open the credential set used by your Production (or Preview) builds.
   • Copy SHA-1 and SHA-256 (or download the keystore and run keytool if shown there).

   Or run (interactive):  npx eas-cli credentials -p android

2) Firebase (required for OTP / Play Integrity)
   • Firebase Console → Project settings → Android app com.armada.ride → Add fingerprint
   • Add BOTH SHA-1 AND SHA-256 from step 1.
   • If you use Play App Signing (Play Console), ALSO add fingerprints from
     Play Console → Your app → Test / setup → App integrity → App signing key certificate
     (Google re-signs the APK users download from Play; often different from upload/EAS.)

2b) Play Integrity API ↔ Cloud project (fixes auth/unknown Error 39 on Play builds)
   • Play Console → App integrity → Play Integrity API → Link a Google Cloud project
     → choose the SAME project as Firebase (armada-25d8a / 1058271509496).
   • Google Cloud Console → APIs & Services → Library → enable "Play Integrity API".
   • Wait up to 24 hours after linking; testers must install/update from Play (not sideloaded APK).

3) Refresh google-services.json
   • After adding fingerprints → Firebase Console → Download google-services.json
   • Replace repo root google-services.json, then:
       npm run android:copy-google-services
     (copies root → android/app for Gradle)

4) Google Cloud — Maps SDK key (EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY per Expo environment)
   • Google Cloud Console → APIs & Services → Credentials → Your Android Maps key.
   • Application restrictions: Android apps.
   • Add package com.armada.ride AND the SAME SHA-1 from step 1 (and repeat for Play signing if needed).
   • API restrictions: enable "Maps SDK for Android". Billing on.

   Production vs Preview on Expo uses different keys in env — repeat restrictions for EACH key you use.

5) Rebuild on EAS
   • eas build --profile production --platform android

Local release build checklist: npm run verify:android-release  (or npm run android:apk:local / android:aab:local — runs this automatically).

Docs in repo: FIREBASE_SHA_FINGERPRINTS.md (debug values there are NOT enough for production alone).
`);
