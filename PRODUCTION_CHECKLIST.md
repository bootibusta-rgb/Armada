# Armada – Full Production Launch Checklist

Use this checklist before launching to production.

---

## 1. Backend & Payments ✅

- [x] **Cash payments** – `processCashFlag` updates Firebase ride status to `completed`
- [x] **Card payments (PayPal)** – `processCardPayment` updates ride status with transaction ID
- [x] **Driver earnings** – `earningsService` reads completed rides with `completedAt`

---

## 2. PayPal

### Web (card payments)

1. Go to [developer.paypal.com](https://developer.paypal.com) → **My Apps & Credentials**
2. Create or select your app
3. Switch to **Live** and copy the **Live Client ID**
4. Add to `.env`:
   ```env
   EXPO_PUBLIC_PAYPAL_CLIENT_ID=your_live_client_id
   ```

### Native (Pay Now link)

- Use a **Live** Pay Now / payment link: `EXPO_PUBLIC_PAYPAL_PAYMENT_LINK`
- Must match your **Live** PayPal business account (same environment as the Live Client ID)

---

## 3. Firebase

- [ ] **Firestore rules** – Restrict read/write by user role
- [ ] **Realtime Database rules** – Secure `locations/` and `chats/`
- [ ] **Phone Auth** – Enable in Firebase Console if using OTP
- [ ] **Indexes** – Add composite indexes for any query errors in Firestore

---

## 4. App Store Submission

### Android (Google Play)

1. **Signing** – Create upload keystore:
   ```bash
   npx expo prebuild
   cd android && ./gradlew bundleRelease
   ```
2. **Privacy Policy** – Host at a public URL (e.g. `https://yoursite.com/privacy`)
3. **Add to .env**: `EXPO_PUBLIC_PRIVACY_URL=https://yoursite.com/privacy`
4. **Store listing** – Screenshots, description, content rating

### iOS (App Store)

1. **Apple Developer account** – $99/year
2. **Certificates & provisioning** – Use EAS Build or Xcode
3. **Privacy Policy URL** – Required for submission
4. **App Store Connect** – Screenshots, description, review info

---

## 5. Security

- [ ] **`.env`** – Never commit; ensure it’s in `.gitignore` ✅
- [ ] **API keys** – Restrict Google Maps keys by bundle ID / package
- [ ] **Firebase** – Enable App Check if available

---

## 6. Testing Before Launch

- [ ] End-to-end ride flow (bid → accept → pay cash)
- [ ] End-to-end ride flow (bid → accept → pay card via PayPal)
- [ ] Emergency SOS flow
- [ ] Irie Coins earn/redeem
- [ ] Food stop order flow (if used)

---

## 7. Optional Enhancements

- **Server-side PayPal verification** – Cloud Function to verify capture before marking ride complete
- **Push notifications** – For ride updates, driver arrival
- **Analytics** – Firebase Analytics or similar
- **Crash reporting** – Sentry, Crashlytics

---

## Quick Reference

| Item              | Where                          |
|-------------------|--------------------------------|
| PayPal Client ID  | `.env` → `EXPO_PUBLIC_PAYPAL_CLIENT_ID` |
| Privacy Policy    | `.env` → `EXPO_PUBLIC_PRIVACY_URL`      |
| Google Maps       | `.env` → `EXPO_PUBLIC_GOOGLE_MAPS_*`    |
| Firebase          | `.env` → `EXPO_PUBLIC_FIREBASE_*`       |
