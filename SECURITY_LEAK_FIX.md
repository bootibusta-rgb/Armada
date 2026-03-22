# Fix: Leaked Google API Keys

Google API keys were committed (AndroidManifest, google-services.json). Follow these steps.

## 1. Revoke the leaked keys (do this first)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project **Armada** (armada-25d8a)
3. **APIs & Services** → **Credentials**
4. Find and **delete** any keys that were exposed (check GitGuardian/GitHub alert)
5. Create new keys as needed (see below)

## 2. Google Maps API key (was in AndroidManifest)

The manifest now reads from `android/local.properties` (gitignored).

1. **Create** a new Maps API key: Credentials → Create credentials → API key
2. **Restrict** it: Android apps, package `com.armada.app`, SHA-1 from `cd android && ./gradlew signingReport`
3. **Add locally** – create or edit `android/local.properties`:
   ```
   GOOGLE_MAPS_API_KEY=your_new_maps_key_here
   ```
4. Copy `android/local.properties.example` for the format

## 3. Firebase keys (google-services.json)

See `GOOGLE_SERVICES_LEAK_FIX.md`. Never commit `google-services.json`.

## 4. Rebuild

```bash
npx expo run:android
```

## 5. Dismiss alerts

1. GitHub → **Security** → **Secret scanning alerts**
2. Mark as resolved after revoking keys
