# Add these SHA fingerprints to Firebase

Copy these values into **Firebase Console** → **Project settings** → **Your apps** → Android app (`com.armada.app`) → **Add fingerprint**.

---

## SHA-1 (required for Phone Auth)

```
5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

## SHA-256 (recommended)

```
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

---

## Steps in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (**armada-25d8a**)
3. Click the **gear icon** → **Project settings**
4. Scroll to **Your apps**
5. Find your **Android** app (package: `com.armada.app`)
6. Click **Add fingerprint**
7. Paste the **SHA-1** above → Save
8. Click **Add fingerprint** again
9. Paste the **SHA-256** above → Save

---

**Note:** These are from your debug keystore (`android/app/debug.keystore`). For production/Play Store builds, you'll need to add the release keystore's SHA-1/SHA-256 as well.
