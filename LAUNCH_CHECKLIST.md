# Armada Launch Checklist

## 0. Fix verifyPayPalCapture (if it failed to deploy)

If `verifyPayPalCapture` failed with "Access to bucket... denied":

1. Go to [Google Cloud Console](https://console.cloud.google.com) → select project **armada-25d8a**
2. **IAM & Admin** → **IAM** → find `1058271509496-compute@developer.gserviceaccount.com` (or `*-compute@developer.gserviceaccount.com`)
3. Click the pencil (edit) → **Add another role** → **Storage Object Viewer** → Save
4. **Alternatively:** Cloud Storage → Buckets → find `gcf-sources-*-us-central1` → Permissions → Add principal: `*-compute@developer.gserviceaccount.com` with role **Storage Object Viewer**
5. Run `firebase deploy --only functions` again

## 1. Deploy Firebase (run these commands)

```bash
# Login to Firebase (if not already)
firebase login

# Deploy Cloud Functions (push notifications, PayPal verification)
cd functions && npm install && npm run deploy

# Deploy Firestore rules
cd .. && firebase deploy --only firestore:rules

# Deploy Realtime Database rules
firebase deploy --only database
```

## 2. Create Development Build

### Option A: Local build (requires Android Studio / Xcode)

```bash
# Generate native projects
npx expo prebuild

# Android
npx expo run:android

# iOS (Mac only)
npx expo run:ios
```

### Option B: EAS Build (cloud build, recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build Android APK (for testing)
eas build --profile preview --platform android

# Build production (for store submission)
eas build --profile production --platform android
eas build --profile production --platform ios
```

## 3. Test Before Submission

- [ ] Request ride → bidding → accept → active ride → payment → receipt
- [ ] Driver: go online → receive bid → accept → active ride
- [ ] Push notifications (bid, accepted, driver arriving, cancelled)
- [ ] Offline mode (cached routes)
- [ ] Emergency call / WebRTC (requires dev build)

## 4. App Store Submission

### Google Play

1. Create app in [Google Play Console](https://play.google.com/console)
2. Fill store listing (title, description, screenshots)
3. Set up content rating questionnaire
4. Create service account for EAS Submit:
   - Play Console → Setup → API access → Create service account
   - Download JSON key → save as `google-service-account.json` in project root
5. Update `eas.json` submit.production.android.serviceAccountKeyPath
6. Run: `eas submit --platform android --latest`

### Apple App Store

1. Enroll in [Apple Developer Program](https://developer.apple.com) ($99/year)
2. Create app in [App Store Connect](https://appstoreconnect.apple.com)
3. Fill metadata, screenshots (use App Store Connect or Transporter)
4. Update `eas.json` submit.production.ios with your appleId and ascAppId
5. Run: `eas submit --platform ios --latest`

## 5. Pre-Submission Requirements

- [ ] Privacy Policy URL (host your PrivacyPolicyScreen content)
- [ ] App icon (1024×1024 for iOS, 512×512 for Android)
- [ ] Screenshots for each device size
- [ ] .env filled with production values (Firebase, Maps, PayPal)

## 6. Optional: PayPal Production

For production card payments, set Firebase config:

```bash
firebase functions:config:set paypal.client_id="YOUR_LIVE_CLIENT_ID" paypal.client_secret="YOUR_LIVE_SECRET"
firebase deploy --only functions
```
