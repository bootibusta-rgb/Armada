# Dev Build & Push Notification Test

## Step 1: Create a Development Build

Push notifications **do not work in Expo Go** (removed in SDK 53). You need a dev build.

### Option A: EAS Build (cloud, no Android Studio needed)

```powershell
# 1. Install EAS CLI (if not already)
npm install -g eas-cli

# 2. Log in to Expo (creates free account at expo.dev if needed)
eas login

# 3. Build Android APK for testing
cd h:\Armada
eas build --profile preview --platform android
```

- Build runs in the cloud (~10–15 min)
- Download the APK from the link when done
- Install on your Android device (enable "Install from unknown sources" if prompted)

### Option B: Local Build (requires Android Studio)

```powershell
# 1. Install Android Studio from https://developer.android.com/studio
# 2. Create an Android Virtual Device (AVD): Tools → Device Manager → Create Device
# 3. Start the emulator, then:

cd h:\Armada
npx expo run:android
```

Or connect a physical Android device with USB debugging enabled.

---

## Step 2: Test Push Notifications

1. **Install the dev build** (APK from EAS or app from `run:android`)

2. **Sign in** as a rider and complete a ride request

3. **Trigger notifications:**
   - **"New driver bid"** – Have a driver accept or bid on your ride
   - **"Ride accepted"** – Accept a driver's bid
   - **"Your driver is X min away"** – Driver approaches pickup (ETA 1–5 min)
   - **"Ride cancelled—refund issued"** – Cancel a ride

4. **Check:**
   - Notifications appear in the system tray
   - Tapping "Ride cancelled" opens the receipt screen (deep link)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Expo user account required" | Run `eas login` |
| "No Android device/emulator" | Use EAS Build (Option A) or start an emulator |
| No push received | Ensure you're on the dev build, not Expo Go; check Firebase Cloud Functions are deployed |
| Deep link not opening | Tap the notification (don't swipe it away) |
