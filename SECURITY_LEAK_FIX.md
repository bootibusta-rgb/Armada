# Fix: Leaked Google API Key

Your Google Maps API key was committed to the repo. Follow these steps to fix it.

## 1. Revoke the leaked key (do this first)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project **My First Project** (or the project that owns the key)
3. **APIs & Services** → **Credentials**
4. Find the key that starts with `AIzaSy...` (the one that was in AndroidManifest)
5. Click it → **Delete** or **Regenerate** (regenerate is safer if you need continuity)

## 2. Create a new API key

1. **Credentials** → **Create credentials** → **API key**
2. Copy the new key
3. **Restrict the key** (important):
   - **Application restrictions**: Android apps
   - Add your package: `com.armada.app`
   - Add your debug SHA-1 (get it: `cd android && ./gradlew signingReport`)
   - **API restrictions**: Restrict to **Maps SDK for Android** (and any other APIs you use)

## 3. Add the new key locally (never commit)

**Option A – local.properties (recommended for Android):**

1. Open or create `android/local.properties`
2. Add: `GOOGLE_MAPS_API_KEY=your_new_key_here`
3. `local.properties` is gitignored

**Option B – .env:**

1. Add to `.env`: `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=your_new_key_here`
2. `.env` is gitignored

## 4. Rebuild

```bash
npx expo run:android
```

## 5. Dismiss the GitHub alert

1. GitHub → **Security** → **Secret scanning alerts**
2. Open the alert → **Mark as resolved** (after you’ve revoked the key)

---

**Note:** The leaked key has been removed from the codebase. The manifest now reads the key from `local.properties` or the `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` env var at build time.
