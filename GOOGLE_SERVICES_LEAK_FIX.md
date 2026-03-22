# Fix: Leaked Firebase API Key (google-services.json)

Your Firebase API key was committed in `google-services.json`. Follow these steps.

## 1. Regenerate the key (do this first)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project **Armada** (id: armada-25d8a)
3. **APIs & Services** → **Credentials**
4. Find the key `AIzaSyAeepahy7o9s2B8hTIcvCN7mddNbT5lHz8` (or the one Google alerted about)
5. Click it → **Regenerate key** (or Delete and create new)
6. Copy the new key

## 2. Update your local google-services.json

**Option A – Download fresh from Firebase (recommended):**

1. Go to [Firebase Console](https://console.firebase.google.com) → project Armada
2. Project Settings (gear) → Your apps → Android app
3. Download **google-services.json**
4. Replace `h:\Armada\google-services.json` and `h:\Armada\android\app\google-services.json` with the new file

**Option B – Edit existing files:**

1. Open `google-services.json` and `android/app/google-services.json`
2. Replace the `current_key` value with your new key

## 3. Verify .gitignore

These files are now in `.gitignore` and will not be committed:

- `google-services.json`
- `android/app/google-services.json`

## 4. For new developers

Copy the example and get your own from Firebase:

```bash
# Copy example (structure only – no keys)
cp google-services.json.example google-services.json
cp google-services.json android/app/google-services.json
# Then download real file from Firebase Console and replace both
```

## 5. Dismiss the GitHub alert

1. GitHub → **Security** → **Secret scanning alerts**
2. Open the alert → **Mark as resolved** (after you've regenerated the key)
