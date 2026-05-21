# Real Phone Verification – Setup Complete

## What Was Done

1. **Installed React Native Firebase**
   - `@react-native-firebase/app`
   - `@react-native-firebase/auth`
   - `@react-native-firebase/firestore`

2. **Configured `app.config.js`**
   - Firebase plugins
   - `googleServicesFile` for Android
   - `expo-build-properties` for iOS

3. **Created `google-services.json`**
   - Project: armada-25d8a
   - Package: com.armada.ride
   - **If you have the official file from Firebase Console, replace this with it.**

4. **Updated `authService.js`**
   - Uses React Native Firebase for phone auth on native
   - Uses web Firebase SDK on web

5. **Updated `AuthContext.js`**
   - Uses React Native Firebase auth on native

6. **Ran `expo prebuild --clean`**
   - Regenerated the `android/` folder with Firebase support

7. **Created `android/local.properties`**
   - Set `sdk.dir` for your Android SDK

---

## How to Build & Test on Your Phone

### Option A: USB-connected phone

1. Enable **Developer options** and **USB debugging** on your phone.
2. Connect the phone via USB.
3. Run:
   ```powershell
   cd H:\Armada
   npx expo run:android
   ```

### Option B: Build APK and install manually

1. Run:
   ```powershell
   cd H:\Armada\android
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   $env:ANDROID_HOME = "C:\Users\user\AppData\Local\Android\Sdk"
   .\gradlew.bat assembleDebug
   ```
2. APK path: `android\app\build\outputs\apk\debug\app-debug.apk`
3. Copy the APK to your phone and install it.

---

## “Play Integrity” / “Firebase could not verify this app” (Android)

Your repo’s `google-services.json` must list **OAuth clients** after you register the app’s signing keys. If `"oauth_client": []` is empty, Phone Auth / Play Integrity will often fail.

1. From the repo root, print the **exact** SHAs Gradle uses for **debug** (USB / local APK):

   ```powershell
   cd H:\Armada
   npm run android:signing-report
   ```

2. **Firebase Console** → Project settings → **Your apps** → Android **com.armada.ride** → **Add fingerprint** → add **SHA-1** and **SHA-256** from the **debug** block in that report.

3. **Download `google-services.json` again** from the same Firebase page and replace `H:\Armada\google-services.json`. Open the file and confirm **`oauth_client` is not `[]`** (you should see client entries).

4. Copy into the native project if needed, then rebuild:

   ```powershell
   npx expo prebuild --clean --platform android
   npm run run:android
   ```

**EAS / Play Store builds** use a **different** keystore. For those, add the SHA from **EAS credentials** or **Play Console → App integrity → App signing key certificate**, not only the debug report above.

Use **`npm run verify:eas-android-maps-otp`** for an EAS checklist (Maps + Firebase).

For **local** Gradle builds before `npm run android:apk:local` / `android:aab:local`, run **`npm run verify:android-otp-maps-local`** so Maps + Firebase files and the manifest are aligned.

See **`FIREBASE_SHA_FINGERPRINTS.md`** (EAS section).

---

## `auth/missing-client-identifier` (Play Integrity + reCAPTCHA)

If Metro logs show **`force reCAPTCHA (skip Play Integrity) = true`** and the error says **missing a valid app identifier**:

1. **Turn off the forced reCAPTCHA test flow** in `.env` (unless you have **reCAPTCHA Enterprise** set up in Google Cloud for this project):
   ```env
   EXPO_PUBLIC_FIREBASE_ANDROID_PHONE_USE_RECAPTCHA=false
   ```
   Or remove that line entirely (default is `false`).

2. **Stop Metro, start again** (env vars are baked into the JS bundle: `npx expo start --dev-client --clear` or `npm run live:tweak`).

3. **Retry phone auth** — Firebase will use the normal **Play Integrity** path, which only works if **SHA-1 and SHA-256** for the keystore that signs your APK are in Firebase (see “Play Integrity” section above) and `google-services.json` is current.

Forcing reCAPTCHA without Enterprise often produces exactly this error; your `eas.json` already sets the flag to `false` for EAS builds, but **local `.env` can override and set it to `true`.**

---

## “Requests from this Android client application com.armada.ride are blocked” (`auth/unknown`)

Firebase Phone Auth talks to Google’s backends using API keys from your Firebase/GCP project. That message means **Google Cloud rejected the request** based on **how those keys are restricted** — not Play Integrity vs reCAPTCHA and not “wrong OTP.”

What usually fixes it:

1. **[Google Cloud Console](https://console.cloud.google.com)** → **APIs & Services** → **Credentials**.
2. Open each **API key** your Android app uses (often the Android **`current_key`** shown in `google-services.json`; there may also be separate keys for restricted APIs).
3. **Application restrictions:**
   - **Quick test:** set to **None** temporarily. If phone auth works, restrictions were the cause — then tighten carefully.
   - **Android apps:** package **`com.armada.ride`** plus **SHA-1** (and SHA-256 if listed) for the **exact keystore that signs the APK you run** (`npm run verify:firebase-android` prints debug; Play/internal builds need upload + Play App Signing certs — see **`FIREBASE_SHA_FINGERPRINTS.md`**).
4. **API restrictions:** ensure **Identity Toolkit API** and **Firebase Installations API** are allowed for that key (Maps-only restrictions block phone auth).

---

## Samsung Galaxy A03s / `auth/unknown` (Error code 39)

Cheap Samsung devices often surface **Error 39** when **Play Integrity** or **API key** checks fail — **not** because of mobile data vs Wi‑Fi alone.

**Checklist (project owner):**

1. **Firebase Console** → Project settings → Android **com.armada.ride** → **SHA certificate fingerprints**: include **Play App signing** certificate (Play Console → App integrity) **and** your **upload key**, not only a debug SHA from Android Studio.
2. **Google Cloud Console** → APIs & Services → **Credentials** → the **`current_key`** from `google-services.json`: **Application restrictions** must allow this app (package + SHAs above), or temporarily **None** to confirm; **API restrictions** must include **Identity Toolkit API** and **Firebase Installations API**.
3. Download a fresh **`google-services.json`** after adding fingerprints, replace repo + `npm run android:copy-google-services` (or your sync script), rebuild the **AAB** (bump **versionCode** each upload).
4. On the device: **Settings → Apps → Google Play services** → update; ensure date/time is automatic.

### Play Integrity API ↔ Cloud (required for many Play Store installs)

If Firebase SHAs are correct but you still get **`(auth/unknown)`** / **Error 39** on phones that installed from **Play closed testing**:

1. **Play Console** → **App integrity** → **Play Integrity API** → **Link a Google Cloud project** → select **`armada-25d8a`** (project number `1058271509496`).
2. **Google Cloud Console** → **APIs & Services** → **Library** → enable **Play Integrity API** (enabling the API is not the same as “integrating” it in your app code).
3. Wait **up to 24 hours** after linking.
4. Testers must **install or update from the Play Store tester link** — not a forwarded APK file.
5. Firebase auto API key (**Armada, for com.armada.app**) → keep **Application restrictions: None** until OTP works, then restrict to **Android apps** + `com.armada.ride` + all SHAs.

**On the phone**, the Armada **Profile / sign-in** screen shows **Store build: version (versionCode)** — compare to the build you uploaded so testers are not on an old APK.

---

## Closed testing (Play Store) — not blocked by the 14-day production wait

**Closed testing does not disable phone auth.** Testers install a Play-signed build; Firebase must trust **that** certificate.

1. **Play Console** → **App integrity** → copy **App signing key certificate** SHA-1 (and SHA-256).
2. **Firebase Console** → Project settings → Android `com.armada.ride` → **Add fingerprint** for that SHA (in addition to upload/debug keys).
3. Download fresh **`google-services.json`**, sync to `android/app/`, rebuild AAB, bump **versionCode**, upload a new release to the **same** closed track.
4. On each test phone: **Play Store → Armada → Update** (or uninstall + reinstall from the tester link). The sign-in screen must show **Store build: 10.12.25 (55)** or newer — **not 10.9.0**.

### “My number is already in Firebase Authentication”

That is **expected** and **not** the cause of `(auth/unknown)`. Existing users still receive an SMS and sign into the same UID. `(auth/unknown)` on Samsung/Android almost always means **app verification failed** (old APK, missing Play signing SHA in Firebase, API key restrictions, rate limits, or outdated Google Play services) — not duplicate phone records.

For reliable closed testing without SMS quotas, add **test phone numbers** in Firebase Console → Authentication → Sign-in method → Phone → **Phone numbers for testing** (fixed OTP, no SMS).

---

## Testing Phone Verification

1. Open the app on your phone.
2. Enter your Jamaican phone number (e.g. `+18761234567`).
3. Tap **Send OTP**.
4. Enter the 6-digit code from the SMS.
5. You should be signed in.

---

## If `google-services.json` Is Wrong

If you see Firebase errors, replace `H:\Armada\google-services.json` with the file from Firebase Console:

1. Firebase Console → Project settings → Your apps.
2. Select the **Armada** Android app.
3. Download **google-services.json**.
4. Save it as `H:\Armada\google-services.json`.
5. Run `npx expo prebuild --clean --platform android` again.
