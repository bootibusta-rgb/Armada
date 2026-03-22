# Armada – Production Readiness

**Status: Ready for launch** (as of last update)

---

## ✅ Completed

| Item | Status |
|------|--------|
| **Privacy Policy** | Hosted at https://armada-25d8a.web.app/privacy.html |
| **Terms of Service** | Hosted at https://armada-25d8a.web.app/terms.html |
| **EAS env vars** | Firebase, Maps, PayPal, Privacy URL synced to production |
| **Firestore rules** | Role-based access, secured |
| **Realtime DB rules** | `locations/` and `chats/` secured by participant |
| **.gitignore** | `.env`, `google-service-account.json` excluded |
| **App metadata** | Description, privacy/terms URLs in app.config |
| **Nearby drivers** | RTDB locations + haversine filter; dashboard publishes location every 2 min when online |
| **Analytics** | Native: `@react-native-firebase/analytics`; Web: Firebase JS |
| **Sentry** | Opt-in via `EXPO_PUBLIC_SENTRY_DSN`; ErrorBoundary reports crashes |
| **PayPal verify** | Fails closed if credentials missing (use `paypal.allow_unverified` only for dev) |
| **Demo mode** | Hidden / blocked when `EXPO_PUBLIC_APP_ENV=production` |

---

## Before First Submit

1. **Google Play service account**
   - Create in [Play Console](https://play.google.com/console) → Setup → API access
   - Download JSON → save as `google-service-account.json` in project root
   - Required for `eas submit --platform android --latest`

2. **Screenshots**
   - Capture 2–8 screens from app (see `docs/STORE_LISTING.md`)
   - Sizes: 1080×1920 (Android), 1242×2688 (iOS)

3. **E2E test**
   - Run through `docs/E2E_TEST_CHECKLIST.md` on a dev build

---

## Build & Submit

```bash
# Production Android build
eas build --profile production --platform android

# Submit to Google Play (after build completes)
eas submit --platform android --latest
```

---

## Optional (Post-Launch)

- **PayPal** – App uses **Live** client ID + payment link; Functions must use matching **Live** `client_id` + `client_secret` for `verifyPayPalCapture`
- **iOS** – `eas build --profile production --platform ios` (requires Apple Developer)
- **App Check** – Enable in Firebase for extra security
- **Google Maps restrictions** – Restrict API keys by bundle ID in Cloud Console
