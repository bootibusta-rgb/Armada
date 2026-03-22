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
   - Package: com.armada.app
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
